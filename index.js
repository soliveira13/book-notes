import express, { query } from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import fs from "fs";
import bcrypt, { hash } from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import env from "dotenv";


const app = express();
const port = 3000;
const saltRounds = 10;
env.config();   

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

const db = new pg.Client({
    user: process.env.PG_USER, 
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT
});
db.connect();

// Function to get the information of all books 
// Also get the cover of the books via API request
async function getAllBooks() {
    try {
        const result = await db.query("SELECT * FROM book ORDER BY score DESC");
        const books = result.rows;

        books.forEach(async (book) => {
            getBookCover(book.isbn)
        });

        return books;

    } catch (error) {
        console.log(error);
    }
};

// Gets book cover from OpenLibrary API and saves it to local system  images folder
async function getBookCover(isbn) {
    const imagePath = `./public/images/${isbn}-M.jpg`;

    try {
        // Check if the file already exists
        // const fileExists = await fs.access(imagePath)
        //     .then(() => true)
        //     .catch (() => false);
        
        // if (fileExists) {
        //     console.log(`File already exists: ${imagePath}`);
        //     return imagePath; 
        // }

        const URL =  "https://covers.openlibrary.org/b/isbn/" + isbn + "-M.jpg";
        const response = await axios({
            method: "GET",
            url: URL,
            responseType: "stream"
        });

        const writer = fs.createWriteStream(imagePath);
        response.data.pipe(writer);

    } catch (error) {
        console.error(error);
        return null; 
    }
}

// Home Page 
app.get("/", async (req, res) => {
    try {
        const books = await getAllBooks();

        res.render("index.ejs", { listBooks: books });

    } catch (error) {
        console.error(error);
    }
});

// Rout to Home Page with Order by the Newest date
app.get("/newest", async (req, res) => {
    try {

        const result = await db.query("SELECT * FROM book ORDER BY date_read DESC;");
        const books = result.rows;

        books.forEach((book) => {
            getBookCover(books.isbn);
        });

        res.render("index.ejs", { listBooks: books });
        
    } catch (error) {
        console.error(error);
    }
});

// Rout to Home Page with Order by Title ASC 
app.get("/title", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM book ORDER BY book_title ASC;");
        const books = result.rows;

        books.forEach((book) => {
            getBookCover(books.isbn);
        });

        res.render("index.ejs", { listBooks: books });

    } catch (error) {
        console.error(error);
    }
});

// Rout to register a user
app.get("/register", (req, res) => {
    res.render("register.ejs")
});

// Rout to login a user
app.get("/login", (req, res) => {
    res.render("login.ejs")
});

// Admin Main Page
app.get("/admin", async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const result = await db.query("SELECT * FROM book ORDER BY id");
            const books = result.rows;
    
            res.render("admin.ejs", { 
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

// Book Detailed Page with notes. Based on the book id
app.get("/:id", async (req, res) => {
    try {
        const currentId = parseInt(req.params.id);

        // Get the book data by the id provided
        const resultBook = await db.query(
            "SELECT * FROM book WHERE id = $1",
            [currentId]
        );
        const book = resultBook.rows[0];

        // Get book notes by the id provided
        const resultNote = await db.query(
            "SELECT * FROM note WHERE book_id = $1",
            [currentId]
        );
        const note = resultNote.rows[0];
    
        // Takes the note_content string, finds all occurrences of newline characters (\n), 
        // And replaces them with HTML line break tags (<br>).
        const noteWithLineBreaks = note.note_content.replace(/\n/g, '<br>');
       
        res.render("book-detail.ejs", {
            book: book,
            note: noteWithLineBreaks
        });
        
    } catch (error) {
        console.log("Book Detailed rout.");
        console.error(error);
    }
});

// Register a user. Save user to db and go to admin page
app.post("/register", async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;

    try {
        // First check if user already exist. If email already exists in db. 
        const checkResult = await db.query(
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
                    const result = await db.query(
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
app.post("/login", passport.authenticate("local", {
    successRedirect: "/admin",
    failureRedirect: "/login"
}));

// Add a new book
app.post("/add", async (req, res) => {
    const bookTitle = req.body.title;
    const authorName = req.body.author;
    const isbn = req.body.isbn;
    const dateRead = req.body.dateRead;
    const score = parseInt(req.body.score);
    const bookReview = req.body.bookReview;
    const bookNote = req.body.bookNote;

    let bookId = 0;

    try {

        const result = await db.query(
            "INSERT INTO book (book_title, author_name, isbn, date_read, score, book_review) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
            [bookTitle, authorName, isbn, dateRead, score, bookReview]
        );

        
        if (bookNote) {
            bookId = result.rows[0].id;

            await db.query(
                "INSERT INTO note (book_id, note_content) VALUES ($1, $2)",
                [bookId, bookNote]
            );
        }
        
    res.redirect("/admin");
        
    } catch (error) {
        console.log(error);
    }    
})

// Edit a book
app.get("/admin/edit/:id", async (req, res) => {
    const currentId = parseInt(req.params.id);

    try {

        // Get the data of a book by the id provided
        const resultBook = await db.query(
            "SELECT * FROM book WHERE id = $1",
            [currentId]
        );
        const book = resultBook.rows[0];
        const formattedDate = book.date_read.toISOString().split('T')[0];

        // Get the note of the book by the id provided
        const resultNote = await db.query(
            "SELECT * FROM note WHERE book_id = $1",
            [currentId]
        );
        const note = resultNote.rows[0];
  
        const resultBooks = await db.query("SELECT * FROM book ORDER BY id");
        const books = resultBooks.rows;


        res.render("admin.ejs", { 
            heading: "Edit Book", 
            submit: "Update",
            book: book ,
            dateRead: formattedDate,
            note: note,
            listBooks: books
        });

    } catch (error) {
        console.error(error);
    }
});

// Update Book
app.post("/admin/edit/:id", async (req, res) => {
    const currentId = parseInt(req.params.id);
    const bookTitle = req.body.title;
    const authorName = req.body.author;
    const isbn = req.body.isbn;
    const dateRead = req.body.dateRead;
    const score = parseInt(req.body.score);
    const bookReview = req.body.bookReview;
    const bookNote = req.body.bookNote;

    try {
        // Update the book table
        await db.query(
           "UPDATE book SET book_title = $2, author_name = $3, isbn = $4, date_read = $5, score = $6, book_review = $7 WHERE id = $1",
           [currentId, bookTitle, authorName, isbn, dateRead, score, bookReview] 
        );
    
        // Insert note content into note table if book_id does not exist, otherwise, it updates the note table
        await db.query(
            "INSERT INTO note (book_id, note_content) VALUES ($1, $2) ON CONFLICT (book_id) DO UPDATE SET note_content = EXCLUDED.note_content;",
            [currentId, bookNote]
        );

        res.redirect("/admin");

    } catch (error) {
        console.error(error);        
    }
});

// Delete a book
app.get("/admin/delete/:id", async (req, res) => {
    const currentId = parseInt(req.params.id);
    
    try {
        await db.query(
            "DELETE FROM note WHERE EXISTS (SELECT FROM note WHERE book_id = $1) AND book_id = $1;",
            [currentId]
        );

        await db.query(
            "DELETE FROM book WHERE id = $1",
            [currentId]
        );

        res.redirect("/admin");

    } catch (error) {
        console.error(error);
    }
});

// Register a new strategy for username and password authentication 
passport.use(new Strategy(async function verify(email, password, cb) {
    try {
        const result = await db.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
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
            // res.send("User not found.");
            return cb("User not found.");
        }
        
    } catch (error) {
        // console.error(error);
        return cb(error);
    }
}));

passport.serializeUser((user, cb) => {
    return cb(null, user);
});

passport.deserializeUser((user, cb) => {
    return cb(null, user);
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});