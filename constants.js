export const urls = [
  "https://www.bazaraki.com/real-estate-for-sale/commercial-property/",
  "https://www.bazaraki.com/real-estate-for-sale/buildings/",
  "https://www.bazaraki.com/real-estate-for-sale/prefabricated-houses/",
  "https://www.bazaraki.com/real-estate-for-sale/houses/",
  "https://www.bazaraki.com/real-estate-for-sale/apartments-flats/",
  "https://www.bazaraki.com/real-estate-for-sale/plots-of-land/",
  // "https://www.bazaraki.com/real-estate-for-sale/other/",
];

export const delay = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

export const getDateString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const mins = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}${month}${day}${hour}${mins}`;
};
