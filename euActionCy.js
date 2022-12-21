import vanillaPuppeteer from "puppeteer";
import Stealth from "puppeteer-extra-plugin-stealth";
import { addExtra } from "puppeteer-extra";
import { delay } from "./constants.js";

(async () => {
  const puppeteer = addExtra(vanillaPuppeteer);
  puppeteer.use(Stealth());

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: false,
    userDataDir: "./tmp",
  });

  const page = await browser.newPage();
  await page.goto("https://bot.sannysoft.com");

  const englishLangBtn = await page.$("#langEn");
  await englishLangBtn.click();

  await delay(5000);

  await browser.close();
})();
