import * as fs from "fs";

// Read the JSON file
const data = JSON.parse(fs.readFileSync("bazaraki_202212202330.json", "utf8"));

// Get an array of all the names
const names = data.map((item) => item["Reference number"]);

// Check if all the names are duplicates
const allDuplicates = names.every((name, index) => {
  return names.indexOf(name) !== index;
});

console.log(allDuplicates);
