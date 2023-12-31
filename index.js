import express, { query } from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import fs from "fs";
import { type } from "os";

const app = express();
const port = 3000;

const db = new pg.Client({
    user: "postgres", 
    host: "localhost",
    database: "book_notes",
    password: "3465",
    port: 5432
});
db.connect();

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true}));

// Function to get the information of all books 
// Also get the cover of the books via API request
async function getAllBooks() {
    try {
        const result = await db.query("SELECT * FROM book ORDER BY score DESC");
        const books = result.rows;

        books.forEach(async (book) => {
            getBookCover(book.isbn)
                // .then((imagePath) => {
                //     if (imagePath) {
                //         console.log(`Image saved to: ${imagePath}`);
                //     } else {
                //         console.log("Failed to fetch image");
                //     }
                // })
                // .catch((error) => {
                //     console.error(error);
                // });
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

        // return new Promise((resolve, reject) => {
        //     writer.on("finish", () => resolve(imagePath));
        //     writer.on("error", reject);
        // });

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

// Admin Main Page
app.get("/admin", async (req, res) => {
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
})

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
            console.log("Inserting note into note table.");
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
         
        console.log(bookNote);
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

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});