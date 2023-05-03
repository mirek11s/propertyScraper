import { solveCaptcha } from "2captcha";

const API_KEY = "YOUR_2CAPTCHA_API_KEY";

async function handleCaptcha(
  page,
  captchaImageSelector,
  captchaSolutionInputSelector,
  submitButtonSelector
) {
  if (await page.$(captchaImageSelector)) {
    const captchaImageSrc = await page.$eval(
      captchaImageSelector,
      (img) => img.src
    );
    const captchaSolution = await solveCaptcha(API_KEY, captchaImageSrc);

    await page.type(captchaSolutionInputSelector, captchaSolution);
    await page.click(submitButtonSelector);
  }
}

module.exports = {
  handleCaptcha,
};
