import * as fs from "fs";
import vanillaPuppeteer from "puppeteer";
import Stealth from "puppeteer-extra-plugin-stealth";
import { Cluster } from "puppeteer-cluster";
import { addExtra } from "puppeteer-extra";
import { delay, klimaToMesitesUrls, klimaToMesitesRents, getDateString } from "./constants.js";

(async () => {
  const puppeteer = addExtra(vanillaPuppeteer);
  puppeteer.use(Stealth());

  const cluster = await Cluster.launch({
    puppeteer,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    maxConcurrency: 2,
    concurrency: Cluster.CONCURRENCY_PAGE,
    // monitor: true,
    puppeteerOptions: {
      headless: false,
      defaultViewport: false,
      userDataDir: "./tmp",
    },
    timeout: 86400000, //24h to timeout
  });

  // handle on error in one of the pages so it does not crash the script
  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
  });

  // --scrape=fullSales --scrape=rents
  let list = [];
  let urlsToScrape = klimaToMesitesUrls;
  const date = getDateString();
  const scrapeArgument = process.argv.find((arg) => arg.startsWith("--scrape"))?.split("=")[1];
  let nameStr = "";
  switch (scrapeArgument) {
    case "rents":
      nameStr = `klimaToMesites_rents_${date}.json`;
      urlsToScrape = klimaToMesitesRents;
      break;
    case "fullSales":
    default:
      nameStr = `klimaToMesites_full_${date}.json`;
      break;
  }

  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url, { timeout: 0 });

    await delay(5000);
  });

  for (const url of urlsToScrape) {
    await cluster.queue(url);
  }

  await cluster.idle();
  await cluster.close();

  // adding the array brackets at the end of the script
  //   const fileData = fs.readFileSync(nameStr, "utf8");
  //   const newData = "[" + fileData + "]";
  //   fs.writeFileSync(nameStr, newData, "utf8");
})();
