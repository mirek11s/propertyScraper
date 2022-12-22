import * as fs from "fs";
import vanillaPuppeteer from "puppeteer";
import Stealth from "puppeteer-extra-plugin-stealth";
import { Cluster } from "puppeteer-cluster";
import { addExtra } from "puppeteer-extra";
import { delay } from "./constants.js";

(async () => {
  const puppeteer = addExtra(vanillaPuppeteer);
  puppeteer.use(Stealth());

  const cluster = await Cluster.launch({
    puppeteer,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    maxConcurrency: 1,
    concurrency: Cluster.CONCURRENCY_PAGE,
    // monitor: true,
    puppeteerOptions: {
      headless: false,
      defaultViewport: false,
      userDataDir: "./tmp",
    },
    timeout: 57600000, //16h to timeout
  });

  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  let list = [];
  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url, { timeout: 0 });

    const englishLangBtn = await page.$("#langEn");
    await englishLangBtn.click();
    await page.waitForNavigation(); // Wait for the page to load after changing lang

    await page.waitForSelector("#AuctionsListDiv .AList-BoxContainer");
    const auctionsContainer = await page.$$("#AuctionsListDiv .AList-BoxContainer");

    for (const auction of auctionsContainer) {
      let date_of_conduct = "";
      let date_posted = "";
      let city = "";
      let district = "";
      let uniqueCode = "";
      let reservedPrice = "";

      try {
        date_of_conduct = await page.evaluate(
          (el) =>
            el.querySelector("div.AList-BoxMainCnt > div.AList-BoxMainCell1 > div.DateIcon")
              .textContent,
          auction
        );
      } catch (e) {
        console.log(e);
      }

      try {
        const location = await page.evaluate(
          (el) =>
            el.querySelector(
              "div.AList-BoxMainCnt > div.AList-BoxMainCell4 > div.AList-BoxTextBlue"
            ).textContent,
          auction
        );
        const [townUnfiltered, neighbourhood] = location.split("Municipality");
        const [, town] = townUnfiltered.split(": ");
        city = town;
        district = neighbourhood;
      } catch (e) {}

      console.log("ee");
    }
  });

  const urls = ["https://www.eauction-cy.com/Home/HlektronikoiPleistiriasmoi"];
  for (const url of urls) {
    await cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();
  // adding the array brackets at the end of the script
  // const fileData = fs.readFileSync(`eAuction_${date}.json`, "utf8");
  // const newData = "[" + fileData + "]";
  // fs.writeFileSync(`eAuction_${date}.json`, newData, "utf8");
})();
