const { chromium } = require("playwright");

const BOOKING_URL = "https://swnc.gladstonego.cloud/auth/login";

const USERNAME = process.env.BOOKING_USERNAME;
const PASSWORD = process.env.BOOKING_PASSWORD;

const TARGET_SPORT = "Badminton";
let TIME = "11";

const MAX_RETRIES = 6;
const RETRY_DELAY = 2000;

function getNextWeekDateISO() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setMinutes(date.getMinutes() + 10);
  return date.toISOString().split("T")[0];
}

async function selectDate(page, dateString) {
  const formatted = `${dateString}T00:00:00.000Z`;
  console.log("📅 Selecting:", formatted);
  await page.click(`label[for="${formatted}"]`);
}

async function waitForSlots(page) {
  const selector = 'button[data-qa-id^="book-slot-btn"]';

  for (let i = 0; i < 10; i++) {
    const count = await page.locator(selector).count();
    console.log(`🔍 Attempt ${i + 1}: ${count} slots`);

    if (count > 0) {
      return page.locator(selector);
    }

    await page.waitForTimeout(2000);
    await page.reload();
  }

  throw new Error("No slots found");
}

(async () => {
  const browser = await chromium.launch({
    headless: true, // ✅ REQUIRED for GitHub
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

  // ✅ Login safely
  if (await page.locator('button:has-text("Log In")').isVisible()) {
    await page.fill("input[type=email]", USERNAME);
    await page.fill("input[type=password]", PASSWORD);
    await page.click('button:has-text("Log In")');
    await page.waitForLoadState("networkidle");
  }

  // Navigate
  await page.fill("input[placeholder*='activity']", TARGET_SPORT);
  await page.click(`text=${TARGET_SPORT}`);

  const bookingDate = getNextWeekDateISO();
  await page.fill('input[data-qa-id="activityDate"]', bookingDate);
  await page.keyboard.press("Enter");

  await page.waitForLoadState("networkidle");

  await page.click("text=See available spaces");
  await page.selectOption("select", TIME);

  await page.waitForTimeout(2000);

  let booked = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🚀 Attempt ${attempt}`);

      await selectDate(page, bookingDate);

      await page.waitForTimeout(1500);

      const buttons = await waitForSlots(page);

      await buttons.first().click();

      await page.waitForLoadState("networkidle");

      await page
        .getByRole("button", { name: /Book Badminton/ })
        .click();

      console.log("✅ Booking successful!");
      booked = true;
      break;
    } catch (err) {
      console.log(`⚠️ Retry ${attempt}`, err.message);

      await page.screenshot({ path: `error-${attempt}.png` });

      await page.waitForTimeout(RETRY_DELAY);
      await page.reload();
    }
  }

  if (!booked) {
    console.log("❌ Booking failed");
  }

  await browser.close();
})();
