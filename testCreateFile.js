import * as fs from "fs";

const jsonList = JSON.stringify("hshahahahah") + ",";
fs.appendFileSync("TEST_file.txt", jsonList, function (err) {
  if (err) throw err;
});
