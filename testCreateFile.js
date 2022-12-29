import * as fs from "fs";

try {
  const jsonList = JSON.stringify("hshahahahah") + ",";
  fs.appendFileSync("TEST_file.txt", jsonList, function (err) {
    if (err) throw err;
  });
} catch (e) {
  console.log(e);
}
