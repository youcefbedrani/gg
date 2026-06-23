const ZR_BASE_URL = "https://api.zrexpress.app";
const ZR_API_KEY = process.env.ZR_SECRET_KEY;
const ZR_TENANT_ID = process.env.ZR_TENANT_ID;

const WILAYA_UUID_MAP = {
  1: "6e978fc5-f20a-4b5f-9adf-61dd21a7672a",
  2: "981f136a-996f-463e-a536-8e643daab193",
  3: "00b5ef4b-ae2e-4b7f-bd26-70c1a376b69b",
  4: "37c70742-df6b-4019-981a-a16a29a14748",
  5: "a8c05822-e30a-4d5a-bcb3-3b3bb23c079b",
  6: "295585ad-4cf4-4b7e-b276-9bb62d019749",
  7: "796e70df-1102-44da-9582-2da66ead2ba6",
  8: "e740c188-2bbc-4206-8999-302b17dc0e4b",
  9: "a7e764cf-e9ca-4c1f-8232-89852d102aec",
  10: "a1f0229c-4f34-40aa-9238-fadde6757cba",
  11: "38560f06-e049-4fd2-9664-a655e552b517",
  12: "5afdfab6-e505-4691-abc7-5e8bd79afad5",
  13: "53c9e062-9c4e-4c77-8b71-55eabf887f83",
  14: "ada5bb27-ffe5-4977-a917-3105c2b3d9c6",
  15: "5bef8e95-fad8-4a15-95f0-8d6f5c80f69e",
  16: "d134c182-7dac-4655-9d9b-bbdb62aa2ec4",
  17: "9ee8eac2-77e5-4d70-ac49-bde455d06bee",
  18: "dc851e52-55b2-4beb-a7f1-79d4e73e9458",
  19: "56ee938d-7887-408e-8731-364d07ad3594",
  20: "27b2042a-77f8-4c91-b62d-60934fa0daca",
  21: "a9df7e26-1086-4319-8a93-19969c99c89b",
  22: "2cec2b2a-cc37-480a-9183-59fdfdb65cd4",
  23: "3fd318e8-7c24-480c-a106-21f6c842583d",
  24: "2d1e61ff-e2af-4b4d-a592-0a6436c5fffd",
  25: "e9a1e9cf-8475-4768-94cc-0888d094ff47",
  26: "0e0f2d43-6d78-47dd-8bb7-0f2771cb97ff",
  27: "d7175ca6-6dd7-4dfb-a399-d388e782473a",
  28: "75ca308d-ab36-44e2-9702-2e2300a57b8c",
  29: "a17a6482-3f48-4948-aaf2-8a653c4c1110",
  30: "ada333a0-708d-476e-a97d-fd70fe661b09",
  31: "e772eb46-276a-4f41-bae7-3b67e1bdc616",
  32: "dca8b699-ce8b-4ad7-b8f2-560e63911383",
  34: "80d1b557-03b2-4073-a8c2-89a8712a7fc8",
  35: "f823492c-f79d-4c2d-befe-933bf9917a65",
  36: "e6f4b09c-f63e-42af-92bc-dab9b422c34d",
  38: "fb1a9f7a-81a2-4825-af92-79f9d187637f",
  39: "cd82549a-b1f7-48c1-9a25-2f3f05b80b1d",
  40: "d4549528-8327-4a3f-9732-5a5462c84b8d",
  41: "56d30b7a-465a-462c-bc2a-3e132c89be63",
  42: "1435179a-6dbb-4d9c-a186-c521b2a57319",
  43: "0c8476c5-bbe4-46e4-80e5-67d3501195cc",
  44: "8d2d130f-460c-4867-85ef-641341a4d586",
  45: "ecdf0888-0470-4b2f-beb8-24c99b6fc9cb",
  46: "fc460ec5-3e71-489c-b95b-e5301ea68341",
  47: "e7b51620-74f4-4748-85c5-216fb9b01b03",
  48: "ad58c5ee-868d-4acb-8f03-409f97a10370",
  49: "bcb30485-37b5-4135-a508-acad8a8a9cf8",
  51: "0f2dab00-094c-412c-a7d0-ebd0268d3d3c",
  52: "ba12c65c-de9e-4f30-a449-6ba0b27dd7d7",
  53: "7c752560-8412-4e11-8c75-ed7cd9c22be2",
  54: "f30136dc-3012-4ac7-912c-33eab37393a9",
  55: "442d8a1c-2e12-4a8a-9c7e-8618aac20280",
  57: "eabb6505-5eef-479f-b6a3-36ba282d5237",
  58: "3d19d427-08f3-492c-a1d0-e7ace3516ed2",
};

function normalizePhone(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return "+213" + digits.slice(1);
  }
  if (digits.length === 9) {
    return "+213" + digits;
  }
  if (digits.startsWith("213") && digits.length === 12) {
    return "+" + digits;
  }
  if (digits.startsWith("00213") && digits.length === 14) {
    return "+213" + digits.slice(5);
  }
  return phone;
}

const WILAYA_CODE_MAP = Object.fromEntries(
  Object.entries(WILAYA_UUID_MAP).map(([code, uuid]) => [uuid, Number(code)])
);

const WILAYA_NAMES_AR = {
  "أدرار": 1,
  "الشلف": 2, "شلف": 2,
  "الأغواط": 3, "اغواط": 3,
  "أم البواقي": 4, "ام البواقي": 4,
  "باتنة": 5,
  "بجاية": 6,
  "بسكرة": 7,
  "بشار": 8,
  "البليدة": 9, "بليدة": 9,
  "البويرة": 10, "بويرة": 10,
  "تمنراست": 11,
  "تبسة": 12,
  "تلمسان": 13,
  "تيارت": 14,
  "تيزي وزو": 15,
  "الجزائر": 16, "جزائر": 16, "الجزاير": 16,
  "الجلفة": 17, "جلفة": 17,
  "جيجل": 18,
  "سطيف": 19,
  "سعيدة": 20,
  "سكيكدة": 21,
  "سيدي بلعباس": 22,
  "عنابة": 23,
  "قالمة": 24,
  "قسنطينة": 25,
  "المدية": 26, "مدية": 26,
  "مستغانم": 27,
  "المسيلة": 28, "مسيلة": 28,
  "معسكر": 29,
  "ورقلة": 30,
  "وهران": 31,
  "البيض": 32, "بيض": 32,
  "برج بوعريريج": 34,
  "بومرداس": 35,
  "الطارف": 36, "طارف": 36,
  "تسمسيلت": 38,
  "الوادي": 39, "وادي": 39, "الوادى": 39,
  "خنشلة": 40,
  "سوق أهراس": 41, "سوق اهراس": 41,
  "تيبازة": 42,
  "ميلة": 43,
  "عين الدفلى": 44,
  "النعامة": 45, "نعامة": 45,
  "عين تموشنت": 46,
  "غرداية": 47,
  "غليزان": 48,
  "تيميمون": 49,
  "أولاد جلال": 51, "اولاد جلال": 51,
  "بني عباس": 52,
  "عين صالح": 53,
  "عين قزام": 54,
  "تقرت": 55, "توقرت": 55,
  "المغير": 57, "مغير": 57,
  "المنيعة": 58, "منيعة": 58,
};

function getWilayaCode(cityName) {
  if (!cityName) return null;
  const trimmed = cityName.trim();
  if (WILAYA_NAMES_AR[trimmed]) return WILAYA_NAMES_AR[trimmed];
  const normalized = trimmed.replace(/[ةه]$/, "");
  if (WILAYA_NAMES_AR[normalized]) return WILAYA_NAMES_AR[normalized];
  for (const [name, code] of Object.entries(WILAYA_NAMES_AR)) {
    if (name.includes(trimmed) || trimmed.includes(name)) return code;
  }
  return null;
}

function getCityUuid(wilayaCode) {
  return WILAYA_UUID_MAP[wilayaCode] || null;
}

async function apiRequest(method, path, body, config) {
  const secretKey = config?.secretKey || ZR_API_KEY;
  const tenantId = config?.tenantId || ZR_TENANT_ID;
  const url = `${ZR_BASE_URL}/${path}`;
  const headers = {
    "X-Tenant": tenantId,
    "X-Api-Key": secretKey,
    "Content-Type": "application/json",
    "Api-Version": "1",
  };
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    const causeErrors = err.cause?.errors || [];
    const causeCodes = causeErrors.map(e => e.code);
    const isNetworkError = err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN' || err.message?.includes('fetch failed') || err.message?.includes('network') || causeCodes.some(c => ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH'].includes(c));
    if (isNetworkError) {
      throw new Error('تعذر الوصول إلى خادم ZR Express. قد يكون الخادم متوقفاً أو محظوراً في منطقتك، أو تأكد من اتصالك بالإنترنت.');
    }
    throw new Error('خطأ غير متوقع في الاتصال مع ZR Express: ' + err.message);
  }
  const data = await response.json();
  if (!response.ok) {
    const msg = data?.title || data?.message || JSON.stringify(data);
    const statusGroup = Math.floor(response.status / 100);
    if (statusGroup === 4) {
      throw new Error('فشل طلب ZR Express (خطأ في البيانات): ' + msg);
    } else if (statusGroup === 5) {
      throw new Error('عطل في خادم ZR Express: ' + msg);
    }
    throw new Error(`ZR Express API error (${response.status}): ${msg}`);
  }
  return data;
}

async function searchTerritory(query, config) {
  try {
    const data = await apiRequest("POST", "api/v1/territories/search", { q: query }, config);
    return data?.items || data?.results || data || [];
  } catch {
    return [];
  }
}

async function resolveDistrictTerritoryId(order, cityTerritoryId, config) {
  const searchTerms = [order.baladiya, order.address, order.city].filter(Boolean);
  for (const term of searchTerms) {
    if (!term) continue;
    const results = await searchTerritory(term, config);
    if (results.length > 0) {
      const communes = results.filter(r => {
        const level = (r.level || "").toLowerCase();
        return (level === "commune" || level === "district") && r.parentId === cityTerritoryId;
      });
      if (communes.length === 0) continue;
      const deliverable = communes.filter(r => r.delivery?.canSend === true);
      const best = deliverable.length > 0 ? deliverable[0] : communes[0];
      return best.id || null;
    }
  }
  return cityTerritoryId;
}

async function createParcel(order, config) {
  const secretKey = config?.secretKey || ZR_API_KEY;
  const tenantId = config?.tenantId || ZR_TENANT_ID;
  if (!secretKey || !tenantId) {
    throw new Error("ZR Express credentials not configured");
  }
  const wilayaCode = getWilayaCode(order.city);
  if (!wilayaCode) {
    throw new Error(`Could not resolve wilaya code for city: ${order.city}`);
  }
  const cityTerritoryId = getCityUuid(wilayaCode);
  if (!cityTerritoryId) {
    throw new Error(`No ZR Express territory UUID for wilaya code ${wilayaCode}`);
  }

  let districtTerritoryId = cityTerritoryId;
  try {
    const resolved = await resolveDistrictTerritoryId(order, cityTerritoryId, config);
    if (resolved) districtTerritoryId = resolved;
  } catch (e) {
    console.warn("District search failed, using city UUID as district:", e.message);
  }

  const payload = {
    customer: {
      customerId: "cus_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10),
      name: order.customer_name,
      phone: { number1: normalizePhone(order.phone_number) },
    },
    deliveryAddress: {
      cityTerritoryId,
      districtTerritoryId,
      street: order.address || null,
    },
    orderedProducts: [
      {
        productName: order.artwork_name || "لوحة رسم بالأرقام",
        unitPrice: order.total_price || 3900,
        quantity: order.quantity || 1,
        stockType: "none",
      },
    ],
    deliveryType: "home",
    description: `${order.artwork_name || "لوحة"} - ${order.size || "30x30"} - كمية: ${order.quantity || 1}`,
    amount: order.total_price || 3900,
    externalId: order.order_id,
  };
  if (order.notes) {
    payload.notes = order.notes;
  }
  const result = await apiRequest("POST", "api/v1/parcels", payload, config);
  const parcelId = result?.id;
  if (!parcelId) {
    throw new Error("ZR Express did not return a parcel ID");
  }
  const parcelDetail = await getParcel(parcelId, config);
  return {
    zr_parcel_id: parcelId,
    zr_tracking: parcelDetail.trackingNumber || null,
    zr_status: parcelDetail.state?.name || null,
    raw: parcelDetail,
  };
}

async function getParcel(parcelId, config) {
  return await apiRequest("GET", `api/v1/parcels/${parcelId}`, null, config);
}

async function testConnection(config) {
  await apiRequest("POST", "api/v1/workflows/search", { pageNumber: 1, pageSize: 1 }, config);
  return true;
}

module.exports = { createParcel, getParcel, testConnection, getWilayaCode, getCityUuid, searchTerritory, resolveDistrictTerritoryId };
