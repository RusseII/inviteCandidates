/* eslint-disable no-param-reassign */
/* eslint-disable no-console */
const { MongoClient, ObjectID } = require('mongodb');
const fetch = require('node-fetch');

const MONGODB_URI = process.env.DEEPHIRE_MONGODB_URI;

let cachedDb = null;

// const mockData = {
//   candidateEmail: 'russell@deephire.com',
//   userName: 'Russell Ratcliffe',
//   companyName: 'TestHire',

//   deadline: '5/5/2021',
//   messages: [
//     {
//       followUp: 2,
//       message: 'Hey dude',
//     },
//   ],
// };
async function connectToDatabase() {
  const uri = MONGODB_URI;
  console.log('=> connect to database');

  if (cachedDb) {
    console.log('=> using cached database instance');
    return Promise.resolve(cachedDb);
  }

  const connection = await MongoClient.connect(uri);
  console.log('=> creating a new connection');
  cachedDb = connection.db('content');
  return Promise.resolve(cachedDb);
}

const sendReminderEmail = async body => {
  const url = 'https://a.deephire.com/v1/emails';
  const template = 'deephire-interview-intro';

  const { candidateEmail, interviewId, userName, companyName } = body;

  const interviewUrl = `https://interviews.deephire.com?id=${interviewId}&fullname=${userName}&email=${candidateEmail}`;
  let userNameFirst;
  if (userName) {
    // eslint-disable-next-line prefer-destructuring
    userNameFirst = userName.split(' ')[0];
  }
  const subject = `INVITATION: Next Steps at ${companyName}`;
  const text = body.messages[body.count].message;
  const data = {
    recipients: [candidateEmail],
    template,
    interviewUrl,
    text,
    userNameFirst,
    subject,
  };
  const headers = { 'Content-Type': 'application/json' };
  console.log(data);
  const emailSent = await fetch(url, { method: 'POST', headers, body: JSON.stringify(data) });
  console.log(emailSent);
  return emailSent;
};

async function getStatus(db, body) {
  console.log(body);
  const { candidateEmail, interviewId } = body;
  console.log(body, candidateEmail, interviewId);
  // eslint-disable-next-line no-underscore-dangle

  console.log('=> query database');

  const candidate = await db
    .collection('events')
    .findOne({
      event: 'started',
      candidateEmail,
      'completeInterviewData.interviewData._id': new ObjectID(interviewId),
    })
    .catch(err => {
      console.log('=> an error occurred: ', err);
      return { statusCode: 500, body: 'error adding to mongodb' };
    });

  // check body count, so the first invitation is always sent
  if (candidate && body.count !== 0) {
    body.completed = true;
    return body;
  }
  await sendReminderEmail(body);
  body.completed = false;
  return body;
}

const executeMongo = async (event, context, callback) => {
  console.log('event:', event);
  // eslint-disable-next-line no-param-reassign
  context.callbackWaitsForEmptyEventLoop = false;
  let body = {};
  if (event.body !== null && event.body !== undefined) {
    body = JSON.parse(event.body);
  } else if (event.Input) {
    body = event.Input;
  }

  // const { candidateEmail, completeInterviewData } = body;

  const db = await connectToDatabase();
  const resp = await getStatus(db, body);
  console.log(resp);
  callback(null, resp);
};

module.exports.handler = executeMongo;

// executeMongo({body: {city: 'Hammondsville', state: "Ohio"}}, {}, {})
