const { chromium } = require("playwright");

const BOOKING_URL = "https://swnc.gladstonego.cloud/auth/login";

const USERNAME = process.env.BOOKING_USERNAME;
const PASSWORD = process.env.BOOKING_PASSWORD;

const TARGET_SPORT = "Badminton";
let AVAIALABLE_SLOTS = " See available spaces";
let TIME = "19";

const BOOKING_OPEN_HOUR = 0;
const BOOKING_OPEN_MINUTE = 0;

const MAX_RETRIES = 6;
const RETRY_DELAY = 2000; // ms

function getBookingDate() {
  const d = new Date();
  //set to 7 days after day light savings
  d.setDate(d.getDate() + 7);
 // d.setMinutes(d.getMinutes() + 10);
  const date = d;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const formattedDate = formatter.format(date);
  console.log(formattedDate);
  return formattedDate;
}
// async function selectDate(page, dateString) {
//   const formatted = `${dateString}T00:00:00.000Z`;
// console.log('booking date now',formatted);
//   await page.click(`label[for="${formatted}"]`);
// }

async function selectDate(page, date) {
  const d = new Date(date);

  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = d.getDate();
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  const year = d.getFullYear();

  const ariaLabel = `${weekday} ${day}: View availability for ${month} ${day}, ${year}`;
console.log('label click',ariaLabel)
  await page.getByLabel(ariaLabel).click();
}

function getNextWeekDateISO() {
  const now = new Date();

  // ✅ Get UK date parts safely (no parsing issues)
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric"
  }).formatToParts(now);

  const day = parseInt(parts.find(p => p.type === "day").value);
  const month = parseInt(parts.find(p => p.type === "month").value);
  const year = parseInt(parts.find(p => p.type === "year").value);
  const hour = parseInt(parts.find(p => p.type === "hour").value);

  // ✅ Build proper date
  const ukDate = new Date(year, month - 1, day, hour);

  // ✅ Add +1 hour buffer (for 11:55 → next day)
  ukDate.setHours(ukDate.getHours() + 1);

  // ✅ Add 7 days
  ukDate.setDate(ukDate.getDate() + 7);

  // Format YYYY-MM-DD
  const y = ukDate.getFullYear();
  const m = String(ukDate.getMonth() + 1).padStart(2, "0");
  const d = String(ukDate.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function getUKTime() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(now);

  const get = (t) => parts.find(p => p.type === t).value;

  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`
  );
}


function waitUntilMidnight() {
  console.log("🌙 Waiting for 12:00 AM UK time...");

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const now = getUKTime();

      console.log(`⏱ UK Time: ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`);
      console.log('yes',now.getHours())
      if (
        now.getHours() === 0 &&
        now.getMinutes() >= 0 &&
        now.getMinutes() < 30
      ) {
          console.log('yes')
        clearInterval(interval);
        resolve();
      }
    }, 500); // check twice per second
  });
}

async function isBookingConfirmed(page) {
  const heading = page.getByRole('heading', { name: 'Booking Confirmed!' });
 
  try {
    await heading.waitFor({ timeout: 2000 });

    // Optional: check booking reference exists
  
    return true;
  } catch {
    return false;
  }
}

(async () => {
  const bookingDate = getBookingDate();
  console.log(`📅 Target booking date: ${bookingDate}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Open early
  await page.goto(BOOKING_URL);

  // Login if required
  if (await page.locator("button", { hasText: "Log In" })) {
    // await page.click('text= Log In ');
    await page.fill("input[type=email]", USERNAME);
    await page.fill("input[type=password]", PASSWORD);
    await page.click('button:has-text("Log In")');
    await page.waitForLoadState("networkidle");
  }

  // Navigate BEFORE midnight
  
  await page.click("input", { hasText: "Start typing an activity.." });
  await page.click(`text=${TARGET_SPORT}`);
  await page.fill('input[data-qa-id="activityDate"]', bookingDate);
  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle");
  await page.click(`text=${AVAIALABLE_SLOTS}`);
  await page.selectOption("select", TIME);
  await page.waitForTimeout(1000);
  // await page.pause();
  AVAIALABLE_SLOTS = "From 19:00";
  await page.waitForLoadState("networkidle");
  // Wait until booking opens

  await page.reload();
  await page.waitForTimeout(1000);
   await page.waitForLoadState("networkidle");
  console.log("🔍 Looking for available slots...");
  let booked = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt === 3) {
        TIME = "18";
        AVAIALABLE_SLOTS = "From 18:00";
      }
      await page.locator("app-activity-calendar-start-time-filter").click();
      await page.selectOption("select", TIME).click;
      await page.waitForTimeout(2000);
      await waitUntilMidnight();
      await page.waitForTimeout(1500);
      const bookingDate = getNextWeekDateISO();
      console.log('booking date',bookingDate)
      await selectDate(page, bookingDate);
      await page.waitForTimeout(2000);

      await page.waitForLoadState("networkidle");
      const availableSlots = page.locator(".activity-calendar-timetable-slot", {
        has: page.locator('button:has-text("Book now")'),
      });
      const count = await availableSlots.count();

      if (count === 0) {
        throw new Error("No available courts");
      }

      const slots = [];

      for (let i = 0; i < count; i++) {
        const slot = availableSlots.nth(i);

        const courtName = await slot
          .locator(".activity-calendar-timetable-slot__heading")
          .innerText();

        const time = await slot
          .locator(".activity-calendar-timetable-slot__time")
          .innerText();

        slots.push({
          index: i,
          courtName: courtName.trim(),
          time: time.trim(),
          locator: slot,
        });
      }

      console.log("Available slots:", slots);
      const nextpreferredOrder = [
        "Jubilee Hall Court 3",
        "Jubilee Hall Court 2",
        "Jubilee Hall Court 4"
      ];
      const preferredOrder = [
        "Main Ct 1",
        "Main Ct 2",
        "Main Ct 3",
        "Main Ct 4",
        "Main Ct 5",
        "Main Ct 6",
        "Main Ct 7",
        "Main Ct 8",
        "Main Ct 9",
        "Main Ct 10",
      ];

      let bestSlot = slots.find((s) => preferredOrder.includes(s.courtName));
      if (bestSlot === undefined) {
        bestSlot = slots.find((s) => nextpreferredOrder.includes(s.courtName));
      }
      if (bestSlot === undefined) {
        bestSlot = slots[0];
      }

      await bestSlot.locator.locator('button:has-text("Book now")').click();
      await page.waitForLoadState("networkidle");
      await page
        .getByRole("button", { name: "Book Badminton for £0.00 at" })
        .click();
  await page.waitForTimeout(2000);
      console.log("🔍 Looking for available slots...",bestSlot);
        const success = await isBookingConfirmed(page);

    if (success) {
      console.log("✅ Booking Confirmed!");
      
    }
    else{
      throw new Error("Booking Failed");
    }

      console.log(`✅ Booking successful on attempt ${attempt}`);
      booked = true;
      break;
    } catch (err) {
      console.log(`⚠️ Attempt ${attempt} failed, retrying...`);
      console.log('error',err)
      await page.reload();
      await page.waitForTimeout(RETRY_DELAY);
    }
  }

  if (!booked) {
    console.log("❌ Booking failed after all retries.");
  }

  await page.waitForTimeout(3000);
  await browser.close();
})();


















