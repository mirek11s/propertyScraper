import * as fs from "fs";
import vanillaPuppeteer from "puppeteer";
import Stealth from "puppeteer-extra-plugin-stealth";
import { Cluster } from "puppeteer-cluster";
import { addExtra } from "puppeteer-extra";
import {
  delay,
  urlsBazaraki,
  urlsBazarakiRents,
  getDateString,
} from "./constants.js";

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
  let urlsToScrape = urlsBazaraki;
  const date = getDateString();
  const scrapeArgument = process.argv
    .find((arg) => arg.startsWith("--scrape"))
    ?.split("=")[1];
  let nameStr = "";
  switch (scrapeArgument) {
    case "today":
      nameStr = `bazaraki_daily_${date}.json`;
      break;
    case "rents":
      nameStr = `bazaraki_rents_${date}.json`;
      urlsToScrape = urlsBazarakiRents;
      break;
    case "fullSales":
    default:
      nameStr = `bazaraki_full_${date}.json`;
      break;
  }

  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url, { timeout: 0 });

    let isAdFromToday = false;
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
            const spanElements = el.querySelectorAll(
              ".announcement-block__breadcrumbs > span"
            );
            const secondSpan = spanElements[1];
            return secondSpan.textContent;
          }, offer);
        } catch (error) {}

        const clearedPrice = price.replace(/\s+/g, " ").trim();
        // replace . with ,
        const newPrice = clearedPrice.replace(/\./g, ",");
        const clearTextDescription = textDescription
          .replace(/\s+/g, " ")
          .trim();

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
              return document.querySelector(".number-announcement > span")
                .textContent;
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

              // Move the mouse to a location outside of the modal and click to close it
              await page2.mouse.click(0, 0);
            }

            try {
              phoneNumber = await page2.evaluate(() => {
                return document
                  .querySelector(".phone-author__subtext > span")
                  .textContent.trim();
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
                const listText = await page2.evaluate(
                  (span) => span.textContent,
                  list
                );
                const clearedText = listText.replace(/\s+/g, " ").trim();
                // create object out of the string ('Area: 95 m²') and push to the list:
                const [key, value] = clearedText.split(": ");
                tagObject[key] = value;
              } catch (error) {}
            }
            await delay(4000);
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
          isAdFromToday = clearTextDescription.includes("Today");

          if (
            !existsInList &&
            (scrapeArgument === "fullSales" || scrapeArgument === "rents")
          ) {
            list.push(newProperty);
            const jsonList = JSON.stringify(newProperty) + ",";
            fs.appendFileSync(nameStr, jsonList, function (err) {
              if (err) throw err;
            });
          } else if (
            !existsInList &&
            scrapeArgument === "today" &&
            isAdFromToday
          ) {
            // if the script is run with --scrape=today, write to file only today's posts
            list.push(newProperty);
            const jsonList = JSON.stringify(newProperty) + ",";
            fs.appendFileSync(nameStr, jsonList, function (err) {
              if (err) throw err;
            });
          }

          await page2.close();
          await delay(1000);
        } catch {
          await page2.close();
        }
      }

      // check if button container exists and click next
      try {
        await page.waitForSelector(".number-list", { visible: true });
      } catch (error) {
        console.log(error);
      }

      const nextButton = await page.$(
        ".number-list-next.js-page-filter.number-list-line"
      );
      isNextBtnExist = nextButton !== null;

      // detect if the next ad is not from today and stop the search
      if (scrapeArgument === "today" && !isAdFromToday) {
        isNextBtnExist = false;
      }

      if (isNextBtnExist) {
        await nextButton.evaluate((b) => b.click());
        // wait for page to fully load
        await page.waitForNavigation({ waitUnitl: "networkidle2" });
        await delay(2000);
      }
    }
  });

  for (const url of urlsToScrape) {
    await cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();

  // adding the array brackets at the end of the script
  const fileData = fs.readFileSync(nameStr, "utf8");
  const newData = "[" + fileData + "]";
  fs.writeFileSync(nameStr, newData, "utf8");
})();
