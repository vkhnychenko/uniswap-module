import fs from "fs"
import path from "path"
import process from "process"
import dotenv from 'dotenv'
import moment from 'moment'
import {authenticate} from '@google-cloud/local-auth'
import {google} from 'googleapis'
import { sendMessageToTelegram } from "./telegramBot.js"

dotenv.config()

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'data/token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'data/credentials.json');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
function loadSavedCredentialsIfExist() {
  try {
    const content = fs.readFileSync(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
function saveCredentials(client) {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  fs.writeFileSync(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    saveCredentials(client);
  }
  return client;
}

/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
async function readSheet(auth, listName) {
  const sheets = google.sheets({version: 'v4', auth});
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${listName}!A1:T1`,
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) {
    console.log('No data found.');
    return;
  }
  console.log('Name, Major:');
  rows.forEach((row) => {
    // Print columns A and E, which correspond to indices 0 and 4.
    console.log(`${row[0]}, ${row[4]}`);
    console.log(`${row}`);
  });
}

/**
 *
 * @param {OAuth2Client} client
 * @param {string} range
 * example : listName!A1:T1
 * @param {Array} data
 */
export async function writeSheet(listName, data){
  try{
    const auth = await authorize()
    const sheets = google.sheets({version: 'v4', auth});
    const resource = {
      'values': [data]
    }
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${listName}!A1:T1`,
      valueInputOption: "USER_ENTERED",
      resource
    });
    console.log(res)
  } catch (e){
    console.log(e.message)
    await sendMessageToTelegram(`Ошибка при записи информации в таблицу: ${SPREADSHEET_ID}. data: ${data}`)
  }
}

async function main(){
  console.log(CREDENTIALS_PATH)
  const client = await authorize()
  console.log('clietn', client)
  // await readSheet(client, 'Invest')
  const currentDate = moment().format('DD.MM.YYYY');
  const data = [currentDate, 'test address', 'test token', 'test amount', 'test price']
  await writeSheet('Liqudity', data)

}


// main()