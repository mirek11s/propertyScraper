import * as fs from "fs";

// Read the JSON file
const data = JSON.parse(fs.readFileSync("../eAuctionCy_20221228.json", "utf8"));

// Determine the length of the array
const length = data.length;
console.log(length);
