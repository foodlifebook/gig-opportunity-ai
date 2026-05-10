const { preprocessCSVText } = require('../src/utils/preprocessFile');

const sample = 'seller,gigid,description,totalorders_2024-01-01\nuser1,123,"hello, world",10';
const result = preprocessCSVText(sample);
console.log(JSON.stringify(result, null, 2));
