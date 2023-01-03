import * as fs from "fs";

// Read the JSON file
const data = JSON.parse(fs.readFileSync("../bazaraki_retails_20230103.json", "utf8"));

// Determine the length of the array
const length = data.length;
console.log(length);
