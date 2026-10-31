const fs = require('fs');
const path = require('path');

const databasePath = path.join(__dirname, 'data', 'db.json');

function readDatabase() {
    return JSON.parse(fs.readFileSync(databasePath, 'utf8'));
}

function writeDatabase(database) {
    fs.writeFileSync(databasePath, JSON.stringify(database, null, 2));
}

module.exports = { readDatabase, writeDatabase };
