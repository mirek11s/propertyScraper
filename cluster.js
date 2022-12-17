import * as fs from "fs";
import { Cluster } from "puppeteer-cluster";
import { delay, urls, getDateString } from "./constants.js";

(async () => {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency: 100,
    monitor: true,
    puppeteerOptions: {
      headless: false,
      defaultViewport: false,
      userDataDir: "./tmp",
    },
    timeout: 7200000,
  });

  // handle on error in one of the pages so it does not crash the script
  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  let list = [];
  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url);

    let isNextBtnExist = true;
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
      try {
        await page.waitForSelector(".number-list", { visible: true });
      } catch (error) {
        console.error(error);
      }

      const nextButton = await page.$(
        ".number-list-next.js-page-filter.number-list-line"
      );

      const isBtnExist = nextButton !== null;
      isNextBtnExist = isBtnExist;

      if (isBtnExist) {
        await nextButton.evaluate((b) => b.click());
        // wait for page to fully load
        await page.waitForNavigation({ waitUnitl: "networkidle2" });
        await delay(4000);
      }
    }

    const jsonList = JSON.stringify(list);
    fs.appendFile(`data_${getDateString()}.json`, jsonList, function (err) {
      if (err) throw err;
    });
  });

  for (const url of urls) {
    await cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();
})();
