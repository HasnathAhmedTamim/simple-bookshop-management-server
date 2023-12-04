const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// Middle-ware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oygpytt.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // Get the database and collection on which to run the operation
    const userCollection = client.db("bookData2").collection("users");
    const bookCollection = client.db("bookData2").collection("book");
    const reviewCollection = client.db("bookData2").collection("reviews");
    const cartCollection = client.db("bookData2").collection("carts");
    const paymentCollection = client.db("bookData2").collection("payments");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      console.log("inside verified token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access " });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access " });
        }
        req.decoded = decoded;
        next();
      });
    };

    // different,use verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //user related Api
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //
    app.get("/users/admin/:email",  async (req, res) => {
      const email = req.params.email;
      // if (email !== req.decoded.email) {
      //   return res.status(403).send({ message: "forbidden access" });
      // }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;

      // many ways
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "user already exits", insertedId: null });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });
    // make admin
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.delete("/users:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // book related api

    app.get("/book", async (req, res) => {
      const result = await bookCollection.find().toArray();
      res.send(result);
    });

    app.get("/book/:id", async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const query = { $or: [{ _id: id }, { _id: new ObjectId(id) }] };
      const result = await bookCollection.findOne(query);
      res.send(result);
    });

    app.post("/book", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await bookCollection.insertOne(item);
      res.send(result);
    });

    app.path("/book/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.body;
      const filter = { $or: [{ _id: id }, { _id: new ObjectId(id) }] };
      const updatedDoc = {
        $set: {
          bootTitle: item.bootTitle,
          category: item.category,
          price: item.price,
          imageURL: item.imageURL,
        },
      };
      const result = await bookCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/book/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { $or: [{ _id: id }, { _id: new ObjectId(id) }] };
      // const query = { _id: new ObjectId(id) };
      const result = await bookCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // cart collection
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    // delete
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // payment
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req?.params?.email };
      if (req?.params?.email !== req?.decoded?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await paymentCollection.find(query).toArray();
      console.log(result);
    });
    // Define the route
    // app.get("/payments", async (req, res) => {
    //   try {
    //     const email = req.query.email;
    //     if (email !== req.decoded.email) {
    //       return res.status(403).send({ message: "Forbidden access" });
    //     }
    //     const results = await paymentCollection.find({ email }).toArray();
    //     res.status(200).json(results);
    //   } catch (error) {
    //     res.status(500).send({ message: "Internal Server Error", error });
    //   }
    // });

    // payment related api
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      // care
      console.log("payment info", payment);

      const query = {
        _id: {
          $in: payment.cardIds.map((id) => new ObjectId(id)),
        },
      };
      const deleteResult = await cartCollection.deleteMany(query);
      res.send({ paymentResult, deleteResult });
    });

    // analytics
    app.get("/admin-stats", async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const bookItems = await bookCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // another way
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce(
      //   (total, payment) => total + payment.price,
      //   0
      // );

      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        bookItems,
        orders,
        revenue,
      });
    });

    // used agg pipeline
    app.get("/order-stats", verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollection
        .aggregate([
          {
            $unwind: "$bookItemIds",
          },
          {
            $lookup: {
              from: "book",
              localField: "bookItemIds",
              foreignField: "_id",
              as: "bookItems",
            },
          },
          {
            $unwind: "$bookItems",
          },
          {
            $group: {
              _id: "$bookItems.category",
              quantity: { $sum: 1 },
              revenue: { $sum: "$bookItems.price" },
            },
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              quantity: "$quantity",
              revenue: "$revenue",
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// app-get
app.get("/", (req, res) => {
  res.send("Cp shop ");
});
app.listen(port, () => {
  console.log(`Book shop running ${port}`);
});
