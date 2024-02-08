import express from "express";
import bodyParser from "body-parser";
import env from "dotenv";
import session from "express-session";
import passport from "passport";
import indexRouter from "./routes/index.js"
import authRouter from "./routes/auth.js";

const app = express();
const port = 3000;
env.config();   

app.set("view engine", "ejs");

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true}));

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 // One day in miliseconds
        }
    }
));
app.use(passport.initialize());
app.use(passport.session());

app.use("/", authRouter);
app.use("/", indexRouter);

app.use((req, res) => {
    res.status(404).send('Not Found');
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});