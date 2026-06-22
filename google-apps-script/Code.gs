/**
 * Google Apps Script for Paint-by-Numbers E-commerce Store
 * Exposes a Web App endpoint (doPost) to log orders directly into a Google Sheet.
 */

function setupSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Set headers exactly as required by the e-commerce store
  const headers = [
    "رقم الطلب", 
    "التاريخ والوقت", 
    "اسم العميل", 
    "الهاتف", 
    "الولاية", 
    "العنوان", 
    "نوع التصميم", 
    "اسم اللوحة", 
    "حجم اللوحة", 
    "الإطار المختار", 
    "الكمية", 
    "عدد الألوان", 
    "تفاصيل الألوان والمزج", 
    "ملاحظات", 
    "الحالة"
  ];
  
  // Clear any existing contents and write headers in row 1
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Apply formatting (bold text, light gray background, borders, wrap text)
  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setFontWeight("bold");
  range.setBackground("#EFEFEF");
  range.setHorizontalAlignment("center");
  
  // Enable text wrapping for row data (especially color recipes)
  sheet.getDataRange().setWrap(true);
  
  // Set default column widths for readability
  sheet.setColumnWidth(1, 120); // Order ID
  sheet.setColumnWidth(2, 150); // Timestamp
  sheet.setColumnWidth(3, 150); // Customer Name
  sheet.setColumnWidth(4, 120); // Phone
  sheet.setColumnWidth(5, 100); // City
  sheet.setColumnWidth(6, 200); // Address
  sheet.setColumnWidth(7, 100); // Design Type
  sheet.setColumnWidth(8, 180); // Artwork Name
  sheet.setColumnWidth(9, 100); // Size
  sheet.setColumnWidth(10, 130); // Frame
  sheet.setColumnWidth(11, 70);  // Qty
  sheet.setColumnWidth(12, 80);  // Color Count
  sheet.setColumnWidth(13, 350); // Colors Detail / Recipes
  sheet.setColumnWidth(14, 200); // Notes
  sheet.setColumnWidth(15, 80);  // Status
  
  Logger.log("Sheet initialized successfully.");
}

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);
    
    const timestamp = new Date();
    // Unique order ID using current timestamp and random digits
    const orderId = "ORD-" + timestamp.getTime() + "-" + Math.floor(Math.random() * 1000);
    
    // Format colors detail into a multi-line readable Arabic string
    let colorsDetailStr = "";
    if (data.colorsDetail && Array.isArray(data.colorsDetail)) {
      colorsDetailStr = data.colorsDetail.map((color, index) => {
        const num = index + 1;
        const targetHex = color.hex || color.color_hex;
        let line = "اللون #" + num + " (" + targetHex + "): ";
        
        if (color.available_direct) {
          line += color.match.name_ar + " (جاهز، بدون مزج)";
        } else if (color.match && color.match.components) {
          const comp1 = color.match.components[0];
          const comp2 = color.match.components[1];
          line += "مزج " + comp1.percentage + "% " + comp1.name_ar + " + " + comp2.percentage + "% " + comp2.name_ar;
          if (color.adjustment_tip) {
            line += " | " + color.adjustment_tip;
          }
        } else {
          line += "لا توجد وصفة دقيقة متوفرة";
        }
        return line;
      }).join("\n");
    }
    
    // Row representation
    const newRow = [
      orderId,
      timestamp.toLocaleString("ar-SA"), // Saudi / generic Arabic timestamp representation
      data.customerName,
      "'" + data.phone, // Prefix with single quote to prevent Google Sheets from dropping leading zeros
      data.city,
      data.address,
      data.designType,
      data.artworkName,
      data.size,
      data.frame,
      data.quantity,
      data.colorCount,
      colorsDetailStr,
      data.notes || "",
      "جديد" // Default status
    ];
    
    sheet.appendRow(newRow);
    
    // Auto-wrap formatting update
    sheet.getDataRange().setWrap(true);
    
    return ContentService.createTextOutput(JSON.stringify({
      result: "success",
      order_id: orderId
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      result: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
