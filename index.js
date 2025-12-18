const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());



app.get('/', (req, res) => {
    res.send('Scholar-Stream Server is Running');
})


const uri = process.env.URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// FB ADmin SDK
const admin = require("firebase-admin");

const serviceAccount = require("./scholarstream-1-adminsdk.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

async function run() {
    try {
        await client.connect();

        const db = client.db('scholarships-db');
        const userCollection = db.collection('users');
        const scholarshipsCollection = db.collection('Scholarships');
        const reviewsCollection = db.collection('reviews');

        app.post('/users', async (req, res) => {
            const newUser = req.body;
            const email = newUser.email;

            const query = { email: email };
            const userExist = await userCollection.findOne(query);

            if (userExist) {
                res.send({ message: 'User already exist...!' })
            } else {
                const result = await userCollection.insertOne(newUser);
                res.send(result);
            }
        })

        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await userCollection.findOne(query);
            res.send({ role: user?.role || 'user' })
        })

        app.patch('/users/role/:id', async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;

            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { role }
            };

            const result = await userCollection.updateOne(query, updateDoc);
            res.send(result);
        });

        app.delete('/users/:id', async (req, res) => {
            try {
                const id = req.params.id;

                // 🔹 1. Find user in MongoDB
                const user = await userCollection.findOne({ _id: new ObjectId(id) });

                if (!user) {
                    return res.status(404).send({ message: "User not found" });
                }

                // 🔹 2. Delete from Firebase Auth
                try {
                    const firebaseUser = await admin.auth().getUserByEmail(user.email);
                    await admin.auth().deleteUser(firebaseUser.uid);
                } catch (fbError) {
                    console.log("Firebase user not found, skipping Firebase delete");
                }

                // 🔹 3. Delete from MongoDB
                const result = await userCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                res.send({
                    message: "User deleted from MongoDB & Firebase",
                    deletedCount: result.deletedCount,
                });

            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to delete user" });
            }
        });

        app.get('/scholarships', async (req, res) => {
            const allSc = await scholarshipsCollection.find().toArray();
            res.send(allSc);
        })

        app.get('/scholarship/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await scholarshipsCollection.findOne(query);
            res.send(result);
        })
        app.get('/reviews/:id', async (req, res) => {
            const id = req.params.id;
            const query = { scholarshipId: id };
            const result = await reviewsCollection.find(query).toArray();
            res.send(result);
        })

        // Create new scholarship
        app.post('/add-scholarship', async (req, res) => {
            try {
                const scholarshipData = req.body;

                // basic validation
                if (
                    !scholarshipData.scholarshipName ||
                    !scholarshipData.universityName ||
                    !scholarshipData.postedUserEmail
                ) {
                    return res.status(400).send({ message: "Missing required fields" });
                }

                scholarshipData.createdAt = new Date();

                const result = await scholarshipsCollection.insertOne(scholarshipData);

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to add scholarship" });
            }
        });

        // Update scholarship
        app.patch('/scholarship/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const updatedData = req.body;

                const query = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: updatedData
                };

                const result = await scholarshipsCollection.updateOne(query, updateDoc);
                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to update scholarship" });
            }
        });

        // Delete scholarship
        app.delete('/scholarship/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await scholarshipsCollection.deleteOne(query);
            res.send(result);
        });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);





app.listen(port, () => {
    console.log(`Movie server is running on port ${port}`);
})