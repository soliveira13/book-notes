import express from "express";
import bcrypt from "bcrypt";
import pool from "../db.js";
import { Strategy } from "passport-local";
import passport from "passport";

const router = express.Router();
const saltRounds = 10;  

passport.serializeUser((user, cb) => {
    cb(null, user);
  });
  passport.deserializeUser((user, cb) => {
    cb(null, user);
  });

// Register a new strategy for username and password authentication 
passport.use(new Strategy(async function verify(username, password, cb) {
    try {
        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            [username]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];
            const dbHashPassword = user.password;

            bcrypt.compare(password, dbHashPassword, (err, result) => {
                if (err) {
                   return cb(err);
                } else {
                    if (result) {
                        // res.redirect("/admin");
                        return cb(null, user);
                    } else {
                        // res.send("Incorrect Password.");
                        return cb(null, false);
                    }
                }
            }); 

        } else {
            return cb("User not found.");
        }
        
    } catch (error) {
        return cb(error);
    }
}));

// Rout to login a user
router.get("/login", (req, res) => {
    res.render("login")
});

// Rout to register a user
router.get("/register", (req, res) => {
    res.render("register")
});

// Admin Main Page
router.get("/admin", async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const result = await pool.query("SELECT * FROM book ORDER BY id");
            const books = result.rows;
    
            res.render("admin", { 
                heading: "Add a New Book",
                submit: "Add",
                listBooks: books, 
            });
    
        } catch (error) {
            console.error(error);
        }
    } else {
        res.redirect("/login")
    }
});

// Register a user. Save user to db and go to admin page
router.post("/register", async (req, res) => {
    const email = req.body.username;
    const password = req.body.password;

    try {
        // First check if user already exist. If email already exists in db. 
        const checkResult = await pool.query(
            "SELECT * FROM users WHERE email = $1", 
            [email]
        ); 

        if (checkResult.rows.length > 0) {
            res.send("Email already exists. Try logging in.")
        } else {
            // Password Hashing
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if (err) {
                    console.log("Error hasing password:", err);
                } else {
                    const result = await pool.query(
                        "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
                        [email, hash]
                    );
                    const user = result.rows[0];
                    req.login(user, (err) => {
                        console.log(err);
                        res.redirect("/admin");
                    });                
                }
            });
        }

    } catch (error) {
        console.error(error);
    }
});

// Rout to check if user can login
router.post("/login", passport.authenticate("local", {
    successRedirect: "/admin",
    failureRedirect: "/login"
}));

// Rout to log user out 
router.post("/logout", (req, res, next) => {
    req.logout(function (err) {
        if (err) {
            return next(err);
        }
        res.redirect("/");
    });
});

export default router;
