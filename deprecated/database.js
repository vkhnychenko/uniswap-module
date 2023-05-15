import { MongoClient } from'mongodb'
import mongoose from 'mongoose'
import log4js from "log4js";
import dotenv from 'dotenv'
dotenv.config()

log4js.configure({
  appenders: { cheese: { type: "file", filename: "data/cheese.log" } },
  categories: { default: { appenders: ["cheese"], level: "error" } },
});

const logger = log4js.getLogger();
logger.level = "debug";

const uri = process.env.MONGO_URI
const Schema = mongoose.Schema

const position = new Schema({
  text: String,
  name: String
})

const Position = new mongoose.model("Position", position)




function getCollection(client, databaseName, collectionName){
  const database = client.db(databaseName);
  return database.collection(collectionName); 
}

export async function insertData(databaseName, collectionName, data) {
  const client = new MongoClient(uri);

  try {

    const collection = getCollection(client, databaseName, collectionName)

    const res = await collection.insertOne(data)
    console.log(res)

  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

export async function getData(databaseName, collectionName, query) {
  const client = new MongoClient(uri);

  try {
    const collection = getCollection(client, databaseName, collectionName)

    const result = await collection.findOne(query);
    return result

  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}







async function test() {
  logger.debug("Some debug messages");
  const client = await mongoose.connect(uri)

  try {
    const postition = await Position.find()

    console.log('postition', postition)

    // const collection = getCollection('snapshot', 'prettyResult')

    // const res = await collection.insertOne({title: 'Back to the Future' })
    // console.log(res)

    // // Query for a movie that has the title 'Back to the Future'
    // const query = { title: 'Back to the Future' };
    // const movie = await collection.findOne(query);

    // console.log(movie);
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

test().catch(console.dir);