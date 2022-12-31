export const urlsBazaraki = [
  "https://www.bazaraki.com/real-estate-for-sale/commercial-property/",
  "https://www.bazaraki.com/real-estate-for-sale/buildings/",
  "https://www.bazaraki.com/real-estate-for-sale/prefabricated-houses/",
  "https://www.bazaraki.com/real-estate-for-sale/houses/",
  "https://www.bazaraki.com/real-estate-for-sale/apartments-flats/",
  "https://www.bazaraki.com/real-estate-for-sale/plots-of-land/",
  // "https://www.bazaraki.com/real-estate-for-sale/other/",
];

export const urlsBazarakiRents = [
  "https://www.bazaraki.com/real-estate-to-rent/apartments-flats/",
  "https://www.bazaraki.com/real-estate-to-rent/commercial-property/",
  "https://www.bazaraki.com/real-estate-to-rent/rooms-flatmates/",
  "https://www.bazaraki.com/real-estate-to-rent/houses/",
  "https://www.bazaraki.com/real-estate-to-rent/short-term/",
  "https://www.bazaraki.com/real-estate-to-rent/plots-of-land/",
];

export const buySellUrls = [
  "https://www.buysellcyprus.com/properties-for-sale/filter-resale/cur-EUR/sort-ru/page-1",
  "https://www.buysellcyprus.com/properties-for-sale/filter-new/cur-EUR/sort-ru/page-1",
  "https://www.buysellcyprus.com/properties-for-sale/filter-bank/cur-EUR/sort-ru/page-1",
];

export const klimaToMesitesUrls = [
  "https://ktimatomesites.com/properties/?offer-type=sale&property-type=house&sortBy=priceLowToHigh",
  "https://ktimatomesites.com/properties/?offer-type=sale&property-type=apartment&sortBy=priceLowToHigh",
  "https://ktimatomesites.com/properties/?offer-type=sale&property-type=plot&sortBy=priceLowToHigh",
  "https://ktimatomesites.com/properties/?offer-type=sale&property-type=land&sortBy=priceLowToHigh",
  "https://ktimatomesites.com/properties/?offer-type=sale&property-type=office&sortBy=priceLowToHigh",
  "https://ktimatomesites.com/properties/?offer-type=sale&property-type=shop&sortBy=priceLowToHigh",
  "https://ktimatomesites.com/properties/?offer-type=sale&property-type=industrial&sortBy=priceLowToHigh",
  "https://ktimatomesites.com/properties/?offer-type=sale&property-type=residential-building&sortBy=priceLowToHigh",
  "https://ktimatomesites.com/properties/?offer-type=sale&property-type=commercial-building&sortBy=priceLowToHigh",
  "https://ktimatomesites.com/properties/?offer-type=sale&property-type=business&sortBy=priceLowToHigh",
];

export const klimaToMesitesRents = [
  "https://ktimatomesites.com/properties/?offer-type=rent&sortBy=priceLowToHigh",
];

export const delay = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

export const getDateString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
};
