const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

// FB ADmin SDK
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(
    Buffer.from(
        process.env.FB_SDK_BASE64,
        "base64"
    ).toString("utf8")
);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const verifyFirebaseToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).send({ message: "Unauthorized access" });
        }

        const token = authHeader.split(" ")[1];

        const decodedUser = await admin.auth().verifyIdToken(token);

        req.decoded = decodedUser; // email, uid, etc
        next();
    } catch (error) {
        console.error("JWT verification failed", error);
        return res.status(401).send({ message: "Invalid token" });
    }
};

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


async function run() {
    try {
        // await client.connect();

        const db = client.db('scholarships-db');
        const userCollection = db.collection('users');
        const scholarshipsCollection = db.collection('Scholarships');
        const reviewsCollection = db.collection('reviews');
        const applicationCollection = db.collection('Applications');

        const verifyAdmin = async (req, res, next) => {
            try {
                const email = req.decoded?.email;

                if (!email) {
                    return res.status(403).send({ message: "Forbidden access" });
                }

                const user = await userCollection.findOne({ email });

                if (!user || user.role !== "Admin") {
                    return res.status(403).send({ message: "Admin access required" });
                }

                next();
            } catch (error) {
                console.error("Admin verification failed:", error);
                res.status(500).send({ message: "Server error" });
            }
        };

        const verifyModerator = async (req, res, next) => {
            try {
                const email = req.decoded?.email;

                if (!email) {
                    return res.status(403).send({ message: "Forbidden access" });
                }

                const user = await userCollection.findOne({ email });

                if (
                    !user ||
                    (user.role !== "Moderator" && user.role !== "Admin")
                ) {
                    return res
                        .status(403)
                        .send({ message: "Moderator access required" });
                }

                next();
            } catch (error) {
                console.error("Moderator verification failed:", error);
                res.status(500).send({ message: "Server error" });
            }
        };

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

        app.get('/users',verifyFirebaseToken, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.patch('/users',verifyFirebaseToken, async (req, res) => {
            const { email } = req.query;
            const { name, photo } = req.body;
            const query = { email }
            const updateData = { $set: { photoURL: photo, name } }
            const result = await userCollection.updateOne(query, updateData);
            res.send(result);
        });


        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await userCollection.findOne(query);
            res.send({ role: user?.role || 'user' })
        })

        app.patch('/users/role/:id', verifyFirebaseToken, async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;

            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { role }
            };

            const result = await userCollection.updateOne(query, updateDoc);
            res.send(result);
        });

        app.delete('/users/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
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

        app.get("/scholarships", async (req, res) => {
            try {
                const {
                    search = "",
                    category,
                    subject,
                    country,
                    sortBy = "date",
                    order = "desc",
                    page = 1,
                    limit = 8,
                } = req.query;

                const query = {};

                // 🔍 Search
                if (search) {
                    query.$or = [
                        { scholarshipName: { $regex: search, $options: "i" } },
                        { universityName: { $regex: search, $options: "i" } },
                        { degree: { $regex: search, $options: "i" } },
                    ];
                }

                // 🎯 Filters
                if (category) query.scholarshipCategory = category;
                if (subject) query.subjectCategory = subject;
                if (country) query.universityCountry = country;

                // 🔑 STABLE SORT (THIS IS THE MAIN FIX)
                let sortQuery = {};

                if (sortBy === "fee") {
                    sortQuery = {
                        applicationFees: order === "asc" ? 1 : -1,
                        _id: 1, // ✅ secondary sort (VERY IMPORTANT)
                    };
                } else {
                    sortQuery = {
                        createdAt: order === "asc" ? 1 : -1,
                        _id: 1, // ✅ secondary sort (VERY IMPORTANT)
                    };
                }

                const pageNumber = Number(page);
                const pageLimit = Number(limit);
                const skip = (pageNumber - 1) * pageLimit;

                const data = await scholarshipsCollection
                    .find(query)
                    .sort(sortQuery)
                    .skip(skip)
                    .limit(pageLimit)
                    .toArray();

                const total = await scholarshipsCollection.countDocuments(query);

                res.send({
                    data,
                    page: pageNumber,
                    totalPages: Math.ceil(total / pageLimit),
                    total,
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch scholarships" });
            }
        });



        // for analytics
        app.get("/analytics/scholarships", async (req, res) => {
            try {
                const scholarships = await scholarshipsCollection.find().toArray();
                res.send(scholarships);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch analytics data" });
            }
        });

        // Get top scholarships (lowest fee or recent)
        app.get("/top-scholarships", async (req, res) => {
            try {
                const { sort = "fee" } = req.query;

                let sortQuery = {};

                if (sort === "recent") {
                    sortQuery = { createdAt: -1 };
                } else {
                    // default: lowest application fee
                    sortQuery = { applicationFees: 1 };
                }

                const result = await scholarshipsCollection
                    .find()
                    .sort(sortQuery)
                    .limit(6)
                    .toArray();

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch top scholarships" });
            }
        });

        app.get('/scholarship/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await scholarshipsCollection.findOne(query);
            res.send(result);
        })

        // review for Scholarship
        app.get('/reviews/:id', async (req, res) => {
            const id = req.params.id;
            const query = { scholarshipId: id };
            const result = await reviewsCollection.find(query).toArray();
            res.send(result);
        })

        // Create new scholarship
        app.post('/add-scholarship', verifyFirebaseToken, verifyAdmin, async (req, res) => {
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
        app.patch('/scholarship/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
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
        app.delete('/scholarship/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await scholarshipsCollection.deleteOne(query);
            res.send(result);
        });

        // Application post
        app.post("/applications", verifyFirebaseToken, async (req, res) => {
            try {
                const application = req.body;

                application.applicationStatus = "pending";
                application.paymentStatus = "unpaid";
                application.applicationDate = new Date();
                application.feedback = "";

                const result = await applicationCollection.insertOne(application);

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to apply" });
            }
        });

        // after payment complete status update
        app.patch("/applications/payment/:id", verifyFirebaseToken, async (req, res) => {
            const id = req.params.id;

            await applicationCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { paymentStatus: "paid" } }
            );

            res.send({ message: "Payment updated" });
        });

        // Get single application by id
        app.get("/applications/:id", async (req, res) => {
            try {
                const id = req.params.id;

                const application = await applicationCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!application) {
                    return res.status(404).send({ message: "Application not found" });
                }

                res.send(application);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to get application" });
            }
        });

        // Get applications by user email
        app.get("/applications", async (req, res) => {
            try {
                const email = req.query.email;

                if (!email) {
                    return res.status(400).send({ message: "Email query is required" });
                }

                const result = await applicationCollection
                    .find({ userEmail: email })
                    .toArray();

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to get applications" });
            }
        });

        // Delete application (only if pending)
        app.delete("/applications/:id", verifyFirebaseToken, async (req, res) => {
            try {
                const id = req.params.id;

                const application = await applicationCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!application) {
                    return res.status(404).send({ message: "Application not found" });
                }

                if (application.applicationStatus !== "pending") {
                    return res.status(403).send({
                        message: "Only pending applications can be deleted",
                    });
                }

                const result = await applicationCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                res.send({
                    message: "Application deleted successfully",
                    deletedCount: result.deletedCount,
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to delete application" });
            }
        });

        // Get all applications for Moderator
        app.get("/moderator/applications", verifyFirebaseToken, verifyModerator, async (req, res) => {
            try {
                const result = await applicationCollection.find().toArray();
                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch applications" });
            }
        });

        // Update application status
        app.patch("/applications/status/:id", verifyFirebaseToken, verifyModerator, async (req, res) => {
            try {
                const id = req.params.id;
                const { status } = req.body;

                const result = await applicationCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            applicationStatus: status,
                        },
                    }
                );

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to update status" });
            }
        });


        // Add or update application feedback
        app.patch("/applications/feedback/:id", verifyFirebaseToken, verifyModerator, async (req, res) => {
            try {
                const id = req.params.id;
                const { feedback } = req.body;

                const result = await applicationCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            feedback,
                        },
                    }
                );

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to update feedback" });
            }
        });

        // Reject application
        app.patch("/applications/reject/:id", verifyFirebaseToken, verifyModerator, async (req, res) => {
            try {
                const id = req.params.id;

                const result = await applicationCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            applicationStatus: "rejected",
                        },
                    }
                );

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to reject application" });
            }
        });


        // Stripe Payment api
        app.post("/create-payment-intent", verifyFirebaseToken, async (req, res) => {
            const { amount, applicationId, scholarshipId, userId, userEmail } = req.body;

            const session = await stripe.checkout.sessions.create({
                mode: "payment",
                line_items: [
                    {
                        price_data: {
                            currency: "usd",
                            product_data: {
                                name: "Scholarship Application Fee",
                            },
                            unit_amount: amount * 100,
                        },
                        quantity: 1,
                    },
                ],
                metadata: {
                    applicationId: applicationId,
                    scholarshipId: scholarshipId,
                    userId: userId
                },
                customer_email: userEmail,
                success_url: `${process.env.SITE_DOMAIN}/payment-success/${applicationId}`,
                cancel_url: `${process.env.SITE_DOMAIN}/payment-cancel/${applicationId}`,
            });

            res.send({ url: session.url });
        });

        // Post review
        app.post("/reviews", verifyFirebaseToken, async (req, res) => {
            const recData = req.body;

            const result = await reviewsCollection.insertOne(recData);
            res.send(result);

        })

        // Get reviews by user email
        app.get("/my-reviews", async (req, res) => {
            try {
                const email = req.query.email;

                if (!email) {
                    return res.status(400).send({ message: "Email is required" });
                }

                const result = await reviewsCollection
                    .find({ userEmail: email })
                    .toArray();

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch reviews" });
            }
        });

        // Update review
        app.patch("/reviews/:id", verifyFirebaseToken, async (req, res) => {
            try {
                const id = req.params.id;
                const { ratingPoint, reviewComment } = req.body;

                const result = await reviewsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            ratingPoint,
                            reviewComment,
                            updatedAt: new Date(),
                        },
                    }
                );

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to update review" });
            }
        });

        // Delete review
        app.delete("/reviews/:id", verifyFirebaseToken, async (req, res) => {
            try {
                const id = req.params.id;

                const result = await reviewsCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                res.send({
                    message: "Review deleted",
                    deletedCount: result.deletedCount,
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to delete review" });
            }
        });

        app.get("/moderator/reviews", verifyFirebaseToken, verifyModerator, async (req, res) => {
            try {
                const result = await reviewsCollection.find().toArray();
                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to fetch reviews" });
            }
        });


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);





app.listen(port, () => {
    console.log(`Movie server is running on port ${port}`);
})
