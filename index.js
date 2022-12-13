import puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: false,
    userDataDir: "./tmp",
  });
  const page = await browser.newPage();
  await page.goto("https://www.bazaraki.com/");

  const RealEstateBtn =
    "#main > section.grey.search-categories-rubric > div > div.categories > div:nth-child(1) > div.icon-categories-container";
  await page.waitForSelector(RealEstateBtn);
  await page.click(RealEstateBtn);

  const showAllAds =
    "#main > section.grey.search-categories-rubric > div > div.categories > div.category-item.open-sub-category > div.sub-category-container > div > a";
  await page.waitForSelector(showAllAds);
  await page.click(showAllAds);

  let list = [];

  const offerContainer = await page.$$(
    ".list-simple__output.js-list-simple__output > .announcement-container"
  );

  for (const offer of offerContainer) {
    const price = await page.evaluate(
      (el) =>
        el.querySelector(
          "div.list-announcement-block > div.announcement-block-link.announcement-block__link > div"
        ).textContent,
      offer
    );
    list.push(price);
  }

  console.log(list);
  // use screenshots for debuggin?
  await page.screenshot({ path: "amazing.png" });
  await browser.close();
})();
