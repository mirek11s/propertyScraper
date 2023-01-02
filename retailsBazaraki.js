import * as fs from "fs";
import vanillaPuppeteer from "puppeteer";
import Stealth from "puppeteer-extra-plugin-stealth";
import { Cluster } from "puppeteer-cluster";
import { addExtra } from "puppeteer-extra";
import { delay, urlsBazaraki, urlsBazarakiRents, getDateString } from "./constants.js";

(async () => {
  const puppeteer = addExtra(vanillaPuppeteer);
  puppeteer.use(Stealth());

  const cluster = await Cluster.launch({
    puppeteer,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    maxConcurrency: 2,
    concurrency: Cluster.CONCURRENCY_PAGE,
    monitor: true,
    puppeteerOptions: {
      headless: true,
      defaultViewport: false,
      userDataDir: "./tmp",
    },
    timeout: 86400000, //24h to timeout
  });

  // handle on error in one of the pages so it does not crash the script
  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  // --scrape=today --scrape=rents
  let list = [];
  const date = getDateString();

  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url, { timeout: 0 });

    let isNextBtnExist = true;
    while (isNextBtnExist) {
      try {
        await page.waitForSelector(
          ".list-simple__output.js-list-simple__output > .announcement-container"
        );
      } catch (error) {}
      const offerContainer = await page.$$(
        ".list-simple__output.js-list-simple__output > .announcement-container"
      );

      // capture all prices and descriptions from the unpaid container
      for (const offer of offerContainer) {
        let price = "";
        let textDescription = "";
        let category = "";
        let adId = "";
        let phoneNumber = "";
        let adAuthor = "";
        let tagObject = {};

        let isAdWithCompanyLogo = null;
        let isVerified = null;
        try {
          isAdWithCompanyLogo = await page.evaluate((el) => {
            return el.querySelector(".list-announcement__logo") !== null;
          }, offer);
        } catch (e) {}

        try {
          isVerified = await page.evaluate((el) => {
            return el.querySelector(".verified") !== null;
          }, offer);
        } catch (e) {}

        // only save non-company ads
        if (!isAdWithCompanyLogo && !isVerified) {
          try {
            price = await page.evaluate(
              (el) =>
                el.querySelector(
                  "div.list-announcement-block > div.announcement-block-link.announcement-block__link > div"
                ).textContent,
              offer
            );
          } catch (e) {}

          try {
            textDescription = await page.evaluate(
              (el) =>
                el.querySelector(
                  "div.list-announcement-block > div.announcement-block-text.announcement-block__text > div > div.announcement-block__date"
                ).textContent,
              offer
            );
          } catch (error) {}

          // return second span of the div
          try {
            category = await page.evaluate((el) => {
              const spanElements = el.querySelectorAll(".announcement-block__breadcrumbs > span");
              const secondSpan = spanElements[1];
              return secondSpan.textContent;
            }, offer);
          } catch (error) {}

          const clearedPrice = price.replace(/\s+/g, " ").trim();
          // replace . with ,
          const newPrice = clearedPrice.replace(/\./g, ",");
          const clearTextDescription = textDescription.replace(/\s+/g, " ").trim();

          await page.evaluate((offer) => {
            offer.scrollIntoView();
          }, offer);
          // find the link in the offer advert and then open newTab using it
          const contentLink = await page.evaluate((offer) => {
            const anchor = offer.querySelector("a");
            const href = anchor.getAttribute("href");
            return href;
          }, offer);

          const page2 = await page.browser().newPage();
          try {
            await page2.goto(`https://www.bazaraki.com${contentLink}`, {
              timeout: 160000,
            });

            await page2.bringToFront();

            try {
              adId = await page2.evaluate(() => {
                return document.querySelector(".number-announcement > span").textContent;
              });
            } catch (error) {}

            // solve the popup afer showing the phone number
            try {
              const showPhoneNumberBtn = await page2.$(".phone-author__subtext");
              await showPhoneNumberBtn.evaluate((b) => b.click());
              await delay(1000);

              let isModalHidden = null;
              try {
                isModalHidden = await page2.evaluate(() => {
                  return document.querySelector("#ui-id-1") !== null;
                }, offer);
              } catch (e) {}

              if (!isModalHidden) {
                await delay(1000);
                const agreeBtn = await page2.$(
                  "#ui-id-1 > div > button.terms-dialog__button.js-agree-terms-dialog"
                );
                agreeBtn && (await agreeBtn.evaluate((b) => b.click()));
              }

              try {
                phoneNumber = await page2.evaluate(() => {
                  return document.querySelector(".phone-author__subtext > span").textContent.trim();
                });
              } catch (error) {}

              try {
                adAuthor = await page2.evaluate(() => {
                  return document
                    .querySelector(
                      "div.list-announcement-right > div > div.author-info > div.author-name.js-online-user"
                    )
                    .textContent.trim();
                });
              } catch (error) {}
            } catch (error) {
              console.log(error);
            }

            const summaryContainer = await page2.$(".chars-column");

            if (summaryContainer) {
              const lists = await summaryContainer.$$("li");
              for (const list of lists) {
                try {
                  const listText = await page2.evaluate((span) => span.textContent, list);
                  const clearedText = listText.replace(/\s+/g, " ").trim();
                  // create object out of the string ('Area: 95 m²') and push to the list:
                  const [key, value] = clearedText.split(": ");
                  tagObject[key] = value;
                } catch (error) {
                  console.log(error);
                }
              }
              await delay(6000);
            }

            const newProperty = {
              adId,
              price: newPrice,
              updatedOn: clearTextDescription,
              category: category,
              phoneNumber,
              adAuthor,
              ...tagObject,
            };

            // filter the list to check if current adId already exist and if it does, dont push it to avoid duplicates
            const existsInList = list.some((obj) => obj.adId === adId);

            if (!existsInList) {
              list.push(newProperty);
              const jsonList = JSON.stringify(newProperty) + ",";
              fs.appendFileSync(`bazaraki_retails_${date}.json`, jsonList, function (err) {
                if (err) throw err;
              });
            }

            await page2.close();
            await delay(1000);
          } catch {
            await page2.close();
          }
        }
      }

      // check if button container exists and click next
      try {
        await page.waitForSelector(".number-list", { visible: true });
      } catch (error) {
        console.log(error);
      }

      const nextButton = await page.$(".number-list-next.js-page-filter.number-list-line");
      isNextBtnExist = nextButton !== null;

      if (isNextBtnExist) {
        await nextButton.evaluate((b) => b.click());
        // wait for page to fully load
        await page.waitForNavigation({ waitUnitl: "networkidle2" });
        await delay(4000);
      }
    }
  });

  for (const url of urlsBazaraki) {
    await cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();

  // adding the array brackets at the end of the script
  const fileData = fs.readFileSync(`bazaraki_retails_${date}.json`, "utf8");
  const newData = "[" + fileData + "]";
  fs.writeFileSync(nameStr, newData, "utf8");
})();
