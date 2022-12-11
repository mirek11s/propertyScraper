const puppeteer = require("puppeteer");

const start = async () => {
  const browser = await puppeteer.launch();
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

  const awaitHeader =
    "#listing > section > div.wrap > div.list-announcement-left > div.rubrics-menu.clearfix > h1";
  await page.waitForSelector(awaitHeader);

  const ulOtherAds =
    "#listing > section > div.wrap > div.list-announcement-left > div.list-announcement-assortiments > ul.list-simple__output.js-list-simple__output";

  const liElements = await page.$$(`${ulOtherAds} li`);

  let list = [];

  liElements.forEach(async (li) => {
    // const className = await li.getProperty("class");
    // const className = await li.getProperty("itemtype");
    list.push(li);
  });

  console.log(list);
  // use screenshots for debuggin?
  await page.screenshot({ path: "amazing.png" });
  await browser.close();
};

start();
