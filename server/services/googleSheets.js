const dotenv = require("dotenv");

dotenv.config();

/**
 * Sends order details to the Google Apps Script Web App endpoint.
 * Only used when USE_GOOGLE_SHEETS=true and GOOGLE_SCRIPT_URL is set.
 * @param {object} orderData - Formatted order data row
 * @returns {Promise<object>} Response from Google Sheets
 */
async function submitOrderToSheets(orderData) {
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  if (!scriptUrl) {
    throw new Error("GOOGLE_SCRIPT_URL not configured");
  }

  const response = await fetch(scriptUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(orderData),
  });

  if (!response.ok) {
    throw new Error(`Google Sheets API responded with status ${response.status}`);
  }

  const data = await response.json();
  return data;
}

module.exports = {
  submitOrderToSheets,
};
