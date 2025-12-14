const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());



app.get('/', (req, res) => {
    res.send('Scholar-Stream Server is Running');
})








app.listen(port, () => {
    console.log(`Movie server is running on port ${port}`);
})