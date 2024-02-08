import express from "express";
import fs from "fs";
import axios from "axios";
import pool from "../db.js";

const router = express.Router();

// Function to get the information of all books 
// Also get the cover of the books via API request
async function getAllBooks() {
    try {
        const result = await pool.query("SELECT * FROM book ORDER BY score DESC");
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
router.get("/", async (req, res) => {
    try {
        const books = await getAllBooks();

        res.render("index", { listBooks: books });

    } catch (error) {
        console.error(error);
    }
});

// Home Page - Order by the Newest date
router.get("/newest", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM book ORDER BY date_read DESC;");
        const books = result.rows;

        books.forEach((book) => {
            getBookCover(books.isbn);
        });

        res.render("index", { listBooks: books });
        
    } catch (error) {
        console.error(error);
    }
});

// Home Page - Order by Title ASC 
router.get("/title", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM book ORDER BY book_title ASC;");
        const books = result.rows;

        books.forEach((book) => {
            getBookCover(books.isbn);
        });

        res.render("index", { listBooks: books });

    } catch (error) {
        console.error(error);
    }
});

// Book Detailed Page with notes. Based on the book id
router.get("/:id", async (req, res) => {
    try {
        const currentId = parseInt(req.params.id);
        
        if (!isNaN(currentId)) {
            // Get the book data by the id provided
        const resultBook = await pool.query(
            "SELECT * FROM book WHERE id = $1",
            [currentId]
        );
        const book = resultBook.rows[0];

        // Get book notes by the id provided
        const resultNote = await pool.query(
            "SELECT * FROM note WHERE book_id = $1",
            [currentId]
        );
        const note = resultNote.rows[0];
    
        // Takes the note_content string, finds all occurrences of newline characters (\n), 
        // And replaces them with HTML line break tags (<br>).
        const noteWithLineBreaks = note.note_content.replace(/\n/g, '<br>');
    
        res.render("book-detail", {
            book: book,
            note: noteWithLineBreaks
        });
        }
        
        
    } catch (error) {
        console.error(error);
    }
});

// Add a new book
router.post("/add", async (req, res) => {
    const bookTitle = req.body.title;
    const authorName = req.body.author;
    const isbn = req.body.isbn;
    const dateRead = req.body.dateRead;
    const score = parseInt(req.body.score);
    const bookReview = req.body.bookReview;
    const bookNote = req.body.bookNote;

    let bookId = 0;

    try {
        const result = await pool.query(
            "INSERT INTO book (book_title, author_name, isbn, date_read, score, book_review) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
            [bookTitle, authorName, isbn, dateRead, score, bookReview]
        );

        if (bookNote) {
            bookId = result.rows[0].id;

            await pool.query(
                "INSERT INTO note (book_id, note_content) VALUES ($1, $2)",
                [bookId, bookNote]
            );
        }
        
    res.redirect("/admin");
        
    } catch (error) {
        console.log(error);
    }
});

// Edit a book
router.get("/admin/edit/:id", async (req, res) => {
    const currentId = parseInt(req.params.id);

    try {
        // Get the data of a book by the id provided
        const resultBook = await pool.query(
            "SELECT * FROM book WHERE id = $1",
            [currentId]
        );
        const book = resultBook.rows[0];
        const formattedDate = book.date_read.toISOString().split('T')[0];

        // Get the note of the book by the id provided
        const resultNote = await pool.query(
            "SELECT * FROM note WHERE book_id = $1",
            [currentId]
        );
        const note = resultNote.rows[0];
  
        const resultBooks = await pool.query("SELECT * FROM book ORDER BY id");
        const books = resultBooks.rows;

        res.render("admin", { 
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
router.post("/admin/edit/:id", async (req, res) => {
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
        await pool.query(
           "UPDATE book SET book_title = $2, author_name = $3, isbn = $4, date_read = $5, score = $6, book_review = $7 WHERE id = $1",
           [currentId, bookTitle, authorName, isbn, dateRead, score, bookReview] 
        );
    
        // Insert note content into note table if book_id does not exist, otherwise, it updates the note table
        await pool.query(
            "INSERT INTO note (book_id, note_content) VALUES ($1, $2) ON CONFLICT (book_id) DO UPDATE SET note_content = EXCLUDED.note_content;",
            [currentId, bookNote]
        );

        res.redirect("/admin");

    } catch (error) {
        console.error(error);        
    }
});

// Delete a book
router.get("/admin/delete/:id", async (req, res) => {
    const currentId = parseInt(req.params.id);
    
    try {
        await pool.query(
            "DELETE FROM note WHERE EXISTS (SELECT FROM note WHERE book_id = $1) AND book_id = $1;",
            [currentId]
        );

        await pool.query(
            "DELETE FROM book WHERE id = $1",
            [currentId]
        );

        res.redirect("/admin");

    } catch (error) {
        console.error(error);
    }
});

export default router;