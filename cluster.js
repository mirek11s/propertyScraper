import * as fs from "fs";
import { Cluster } from "puppeteer-cluster";
import { delay, urls } from "./constants.js";

(async () => {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency: 100,
    // monitor: true,
    puppeteerOptions: {
      headless: false,
      userDataDir: "./tmp",
    },
  });

  // handle on error in one of the pages so it does not crash the script
  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  let list = [];
  let isNextBtnExist = true;
  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url, {
      waitUntil: "load",
      // Remove the timeout
      timeout: 0,
    });

    while (isNextBtnExist) {
      await page.waitForSelector(
        ".list-simple__output.js-list-simple__output > .announcement-container"
      );
      const offerContainer = await page.$$(
        ".list-simple__output.js-list-simple__output > .announcement-container"
      );

      // capture all prices and descriptions from the unpaid container
      for (const offer of offerContainer) {
        let price = "";
        let textDescription = "";
        let category = "";

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

        const newProperty = {
          price: newPrice,
          updatedOn: clearTextDescription,
          category: category,
        };
        list.push(newProperty);
      }

      // check if button container exists and click next
      await page.waitForSelector(".number-list", { visible: true });
      const nextButton = await page.$(
        ".number-list-next.js-page-filter.number-list-line"
      );
      if (nextButton) {
        await nextButton.evaluate((b) => b.click());
        // wait for page to fully load
        await page.waitForNavigation({ waitUnitl: "networkidle2" });
        await delay(4000);
      } else {
        isNextBtnExist = false;
      }
    }

    const jsonList = JSON.stringify(list);
    fs.appendFile("resykt.json", jsonList, function (err) {
      if (err) throw err;
    });

    console.log(jsonList);
    console.log(jsonList.length);
  });

  for (const url of urls) {
    cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();
})();
