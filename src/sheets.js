import path from "path"
import process from "process"
import dotenv from 'dotenv'
import {google} from 'googleapis'
import { sendMessageToTelegram } from "./telegramBot.js"
import { logger } from "../config.js"

dotenv.config()

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'data/credentials.json');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID

//TODO
// async function readSheet(auth, listName) {
//   const sheets = google.sheets({version: 'v4', auth});
//   const res = await sheets.spreadsheets.values.get({
//     spreadsheetId: SPREADSHEET_ID,
//     range: `${listName}!A1:T1`,
//   });
//   const rows = res.data.values;
//   if (!rows || rows.length === 0) {
//     console.log('No data found.');
//     return;
//   }
//   console.log('Name, Major:');
//   rows.forEach((row) => {
//     // Print columns A and E, which correspond to indices 0 and 4.
//     console.log(`${row[0]}, ${row[4]}`);
//     console.log(`${row}`);
//   });
// }


async function getClient(){
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: SCOPES,
  });

  const client = await auth.getClient();
  return client
}

export async function writeSheet(listName, data){
  try{
    const client = await getClient()
    const sheets = google.sheets({ version: 'v4', auth: client });

    const resource = {
      'values': [data]
    }
    const range = `${listName}!A1:T1`;

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      valueInputOption: "USER_ENTERED",
      range,
      resource
    });

    logger.info(JSON.stringify(response))

  } catch (e){
    logger.error(`Error reading data: ${e.message}`)
    await sendMessageToTelegram(`Ошибка при записи информации в таблицу: ${SPREADSHEET_ID}.\nData: ${data}\nError: ${e.message}`)
  }
}

async function main(){
  const data = [1,2,3,4,6]
  await writeSheet('Liqudity', data)

}
// main()