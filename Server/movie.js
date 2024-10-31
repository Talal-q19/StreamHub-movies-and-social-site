const express = require("express");
const app = express();
const fs = require("fs");
const axios = require('axios');


const multer = require('multer');
// for file uploading

const session = require('express-session');
// to help with user sessions to keep them while moving from one page to the other

const path = require("path");
//this helps with differemt file paths

const cors = require("cors");
// this helps prevent malicious requests and enhance security

const dotenv = require("dotenv").config();
//helps with config management and security

const PORT = process.env.PORT || 8000;

app.use(cors());


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET || 'default-secret-key';
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));




//REQUIRE THE DB SERVICE
const dbService = require('./dbService.js'); 
const db = dbService.getDbServiceInstance();


app.use('/assets', express.static(path.join(__dirname, '..', 'Client', 'assets')));
app.use('/images', express.static(path.join(__dirname, '..', 'Client', 'images')));
app.use('/Client', express.static(path.join(__dirname, '..', 'Client')));


//delete
app.use((err, req, res, next) => {
  if (err.code === 'ENOENT') {
    console.error('File not found:', req.path);
    res.status(404).json({ error: 'File not found' });
  } else {
    next(err);
  }
});



app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(cors({
  origin: 'http://localhost:8000', // replace with your frontend URL
  credentials: true
}));


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      const uploadDir = file.fieldname === 'movie' ? 'uploads/movies' : 'uploads/posters';
      cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'movie' && !file.mimetype.startsWith('video/')) {
      return cb(new Error('Only video files are allowed for movies'));
  }
  if (file.fieldname === 'poster' && !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed for posters'));
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 1000 * 1024 * 1024 }, // 1000 MB limit
  fileFilter: fileFilter
});


const uploadDirs = ['uploads/movies', 'uploads/posters'];

uploadDirs.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`Created directory: ${fullPath}`);
    }
});

// Get all movies
app.get('/getAllMovies', (req, res) => {
  const query = 'SELECT * FROM movies';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).json({ success: false, message: 'Error fetching movies', error: err });
    } else {
      res.json({ success: true, data: results });
    }
  });
});


app.get('/getMovie/:id', async (req, res) => {
  try {
      const movieId = req.params.id;
      const result = await db.getMovieById(movieId);
      
      if (result) {
          res.json({ success: true, data: result });
      } else {
          res.status(404).json({ success: false, message: 'Movie not found' });
      }
  } catch (error) {
      console.error('Error fetching movie:', error);
      res.status(500).json({ success: false, message: 'Error fetching movie', error: error.message });
  }
});


app.post('/insertMovie', (req, res) => {
  upload.fields([
      { name: 'movie', maxCount: 1 },
      { name: 'poster', maxCount: 1 }
  ])(req, res, (err) => {
      console.log('Received upload request');

      if (err) {
          console.error('Upload error:', err);
          return res.status(400).json({ success: false, message: 'Upload failed', error: err.message });
      }

      console.log('Received request for /insertMovie');
      console.log('Body:', req.body);
      console.log('Files:', req.files);

      if (!req.files || !req.files['movie'] || !req.files['poster']) {
          console.error('File upload failed: Files are missing');
          return res.status(400).json({ success: false, message: 'File upload failed. Movie and poster files are required.' });
      }

      const { title, genre, rdate, runtime, description, trailer_url } = req.body;
      const movieFile = req.files['movie'][0];
      const posterFile = req.files['poster'][0];

      if (!title || !genre || !rdate || !runtime || !description) {
          console.error('Missing required fields:', { title, genre, rdate, runtime, description });
          return res.status(400).json({ success: false, message: 'Missing required fields' });
      }

      const moviePath = movieFile.path;
      const posterPath = posterFile.path;

      console.log('Attempting to insert into database');
      
      // Send an initial response to prevent timeout
      res.writeHead(200, { 'Content-Type': 'application/json' });

      const query = 'INSERT INTO movies (title, genre, rdate, runtime, description, trailer_url, filepath, imgpath) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
      db.query(query, [title, genre, rdate, runtime, description, trailer_url, moviePath, posterPath], (dbErr, result) => {
          if (dbErr) {
              console.error('Database error:', dbErr);
              res.write(JSON.stringify({ success: false, message: 'Error inserting movie', error: dbErr.message }));
          } else {
              console.log('Movie inserted successfully');
              res.write(JSON.stringify({ success: true, message: 'Movie inserted successfully', id: result.insertId }));
          }
          res.end();
      });
  });
});


app.patch('/updateMovie/:id', async (req, res) => {
  const { title, genre, rdate, runtime, description, trailer_url } = req.body;

  // Ensure all fields are provided
  if (!title || !genre || !rdate || !runtime || !description) {
    console.error('Missing required fields:', { title, genre, rdate, runtime, description });
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const updateFields = {
    title,
    genre,
    rdate,
    runtime,
    description,
    trailer_url
  };

  try {
    const success = await db.updateMovie(req.params.id, updateFields);

    if (success) {
      res.json({ success: true, message: 'Movie updated successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Movie not found' });
    }
  } catch (error) {
    console.error('Error updating movie:', error);
    res.status(500).json({ success: false, message: 'Error updating movie', error: error.message });
  }
});




// Delete a movie
app.delete('/deleteMovie/:id', async (req, res) => {
  console.log(`Received delete request for movie ID: ${req.params.id}`);
  
  try {
    // Fetch the movie
    const movie = await db.fetchMovie(req.params.id);
    if (!movie) {
      console.log('Movie not found');
      return res.status(404).json({ success: false, message: 'Movie not found' });
    }
    console.log('Movie found:', movie);

    // Delete the movie from the database
    const deleted = await db.deleteMovie(req.params.id);
    if (!deleted) {
      return res.status(500).json({ success: false, message: 'Failed to delete movie from database' });
    }
    console.log('Movie deleted from database');

    // Delete associated files
    const fileErrors = [];
    
    const deleteFile = (path) => {
      return new Promise((resolve) => {
        fs.unlink(path, (err) => {
          if (err) {
            console.error(`Error deleting file ${path}:`, err);
            fileErrors.push(`Failed to delete file ${path}: ${err.message}`);
          } else {
            console.log(`File ${path} deleted successfully`);
          }
          resolve();
        });
      });
    };

    if (movie.filepath) {
      await deleteFile(movie.filepath);
    }

    if (movie.imgpath) {
      await deleteFile(movie.imgpath);
    }

    res.json({ 
      success: true, 
      message: 'Movie deleted successfully', 
      fileErrors: fileErrors.length > 0 ? fileErrors : undefined 
    });
  } catch (error) {
    console.error('Error in delete operation:', error);
    res.status(500).json({ success: false, message: 'Error deleting movie', error: error.message });
  }
});



// Search movies
app.get('/searchMovies', async (req, res) => {
  const { title, genre } = req.query;
  let query = 'SELECT * FROM movies WHERE 1=1';
  const params = [];

  if (title) {
    query += ' AND title LIKE ?';
    params.push(`%${title}%`);
  }
  if (genre) {
    query += ' AND genre LIKE ?';
    params.push(`%${genre}%`);
  }

  try {
    const results = await db.query(query, params);
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Error searching movies:', err);
    res.status(500).json({ success: false, message: 'Error searching movies', error: err.message });
  }
});





 app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'Client', 'movie.html'));
});

// plan to start a session here, where when a user presses a mvies to watch it will be stored in the session and direct them to this page 
// where they can watch the video, the video path will be a variable in the session and the video info from the db too.

// app.get("/video", function (req, res) {
//   // Ensure there is a range given for the video
//   const range = req.headers.range;
//   if (!range) {
//     return res.status(400).send("Requires Range header");
//   }

//   console.log('Range:', range);

//   // get video stats (about 61MB)
//   const videoPath = "uploads/movies/1726081504391.mp4";
  
//   if (!fs.existsSync(videoPath)) {
//     console.error(`Video file not found: ${videoPath}`);
//     return res.status(404).send("Video not found");
//   }

//   const videoSize = fs.statSync(`${__dirname}/${videoPath}`).size;
//   // Parse Range
//   // Example: "bytes=32324-"
//   const CHUNK_SIZE = 10 ** 6; // 1MB
//   const start = Number(range.replace(/\D/g, ""));
//   const end = Math.min(start + CHUNK_SIZE, videoSize - 1);

//   console.log(`Streaming bytes ${start}-${end} of ${videoSize}`);

//   // Create headers
//   const contentLength = end - start + 1;
//   const headers = {
//     "Content-Range": `bytes ${start}-${end}/${videoSize}`,
//     "Accept-Ranges": "bytes",
//     "Content-Length": contentLength,
//     "Content-Type": "video/mp4",
//   };


//   // HTTP Status 206 for Partial Content
//   res.writeHead(206, headers);

//   // create video read stream for this particular chunk
//   const videoStream = fs.createReadStream(videoPath, { start, end });

//   // Stream the video chunk to the client
//   videoStream.on('open', () => {
//     videoStream.pipe(res);
//   });

//   videoStream.on('error', (streamErr) => {
//     console.error('Stream Error:', streamErr);
//     res.end(streamErr);
//   });
// });



// app.listen(8000, function () {
//   console.log("Listening on port 8000!");
// });

app.listen(process.env.PORT, () => {
  console.log(`App is running on port ${process.env.PORT}`);
});


// new create
app.post('/insert', async (request, response) => {
  try {
      const db = dbService.getDbServiceInstance();
      const { fName, lName, email, password } = request.body;

      // Check if the email already exists in the database
      const existingUser = await db.getUserByEmail(email);

      if (existingUser) {
          // Email already exists
          return response.status(400).json({ success: false, message: 'Email already used' });
      }

      // Insert the new user into the database
      const result = await db.insertNewName(fName, lName, email, password);

      response.json({ success: true, data: result });
  } catch (err) {
      console.log(err);
      response.status(500).json({ success: false, message: err.message });
  }
});

// login


const bodyParser = require('body-parser');
app.use(bodyParser.json());

app.get('/api/admin-email', (req, res) => {
  res.json({ email: process.env.ADMIN_EMAIL });
});


// app.post('/login', async (request, response) => {
//   const db = dbService.getDbServiceInstance();
//   const { email, password } = request.body;

//   try {
//       const query = 'SELECT * FROM user WHERE email = ? AND password = ?';
//       const results = await db.query(query, [email, password]);

//       if (results.length > 0) {
//           // User found
//           const user = results[0];
//           request.session.userId = user.id;  // Store user ID in session
//           response.status(200).json({ success: true });
//       } else {
//           // User not found
//           response.status(401).json({ success: false, message: 'Invalid email or password' });
//       }
//   } catch (err) {
//       console.error(err);
//       response.status(500).json({ success: false, message: 'An error occurred, please try again.' });
//   }
// });



// app.post('/login', async (request, response) => {
//   const db = dbService.getDbServiceInstance();
//   const { email, password } = request.body;

//   try {
//     const query = 'SELECT * FROM user WHERE email = ? AND password = ?';
//     const results = await db.query(query, [email, password]);
// console.log(results)
//     if (results.length > 0) {
//       // User found
//       const user = results[0];
//       request.session.userId = user.id;  // Store user ID in session
//       response.status(200).json({ success: true });
//       console.log("the session done")
//       // Call the Python Flask API to get movie recommendations
//       const recommendationsResponse = await axios.post('http://localhost:5000/recommend', {
//         user_id: user.id
//       });
//       console.log("called flask")
//       // Send the recommendations along with the login success response
//       response.status(200).json({
//         success: true,
//         recommendations: recommendationsResponse.data
      
//       });
//       console.log(recommendationsResponse.data)
//     } else {
//       // User not found
//       response.status(401).json({ success: false, message: 'Invalid email or password' });
//     }
//   } catch (err) {
//     console.error(err);
//     response.status(500).json({ success: false, message: 'An error occurred, please try again.' });
//   }
// });

app.post('/login', async (request, response) => {
  const db = dbService.getDbServiceInstance();
  const { email, password } = request.body;

  try {
    const query = 'SELECT * FROM user WHERE email = ? AND password = ?';
    const results = await db.query(query, [email, password]);
    console.log(results);

    if (results.length > 0) {
      const user = results[0];
      request.session.userId = user.id;
      console.log("the session done");

      try {
        const recommendationsResponse = await axios.post('http://localhost:5000/recommend', {
          user_id: user.id
        });
        console.log("called flask");
        console.log(recommendationsResponse.data);
        
        const sessionData = {
          userId: user.id,
          fName: user.fName, // Assuming you have these fields
          lName: user.lName,  // Adjust based on your actual column names
          recommendations: recommendationsResponse.data
        };
      //  localStorage.setItem('sessionData', JSON.stringify(sessionData));
    
        response.status(200).json({
          success: true,
          recommendations: recommendationsResponse.data
        });

        // response.status(200).json({
        //   success: true,
        //   recommendations: recommendationsResponse.data
        // });
      } catch (flaskError) {
        console.error("Error calling Flask API:", flaskError);
        response.status(200).json({
          success: true,
          recommendations: []
        });
      }
    } else {
      response.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (err) {
    console.error(err);
    response.status(500).json({ success: false, message: 'An error occurred, please try again.' });
  }
});


function checkAuth(req, res, next) {
  if (req.session.userId) {
    next(); // User is authenticated, allow them to access the route
  } else {
    res.status(401).json({ success: false, message: 'You are not authenticated' });
  }
}

app.get('/profile', checkAuth, async(req, res) => {
  const userId = req.session.userId;
  try {
    const query = 'SELECT * FROM user WHERE id = ?';
    const results = await db.query(query, [userId]);

    if (results.length > 0) {
      const user = results[0];
      res.json({ success: true, data: user });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'An error occurred, please try again.' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
      if (err) {
          return res.status(500).json({ success: false, message: 'Logout failed' });
      }
      res.status(200).json({ success: true });
  });
});



//read
app.get('/getAll', async (request, response) => {
  try {
      const result = await db.getAllData();
      response.json({ data: result });
  } catch (err) {
      console.log(err);
      response.status(500).json({ success: false, message: err.message });
  }
});

app.get('/get/:id', (request, response) => {
  const { id } = request.params;
  const db = dbService.getDbServiceInstance();
  
  const result = db.getDataById(id);
  
  result
  .then(data => response.json({success: true, data: data}))
  .catch(err => console.log(err));
})

// update
app.patch('/update', async (request, response) => {
  try {
      const { id, fName, lName, email, password } = request.body;
      const result = await db.updateNameById(id, fName, lName, email, password);
      response.json({ success: result });
  } catch (err) {
      console.log(err);
      response.status(500).json({ success: false, message: err.message });
  }
});


// delete
app.delete('/delete/:id', async (request, response) => {
  try {
      const { id } = request.params;
      const result = await db.deleteRowById(id);
      response.json({ success: result });
  } catch (err) {
      console.log(err);
      response.status(500).json({ success: false, message: err.message });
  }
});


app.get('/search/:fName/:lName', async (request, response) => {
  try {
      const { fName, lName } = request.params;
      const result = await db.searchByName(fName, lName);
      response.json({ data: result });
  } catch (err) {
      console.log(err);
      response.status(500).json({ success: false, message: err.message });
  }
});


// app.post("/watch-movie", async (req, res) => {
//   const { movieId, userId } = req.body;

//   try {
//     // Fetch movie info from the database
//     const movieInfo = await db.fetchMovieInfoById(movieId);

//     // Store movie info and user info in the session
//     req.session.movieInfo = movieInfo;
//     req.session.userId = userId;

//     // Redirect to the movie page
//     res.redirect("/movie");
//   } catch (err) {
//     console.log(err);
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// // Serve the movie page
// app.get("/movie", function (req, res) {
//   if (!req.session.movieInfo) {
//     return res.status(400).send("No movie info in session");
//   }

//   res.sendFile(path.join(__dirname, '..', 'Client', 'movie.html'));
// });

// // Serve the video
// app.get("/video", function (req, res) {
//   const range = req.headers.range;
//   if (!range) {
//     return res.status(400).send("Requires Range header");
//   }

//   const videoPath = req.session.movieInfo.videoPath;
//   if (!fs.existsSync(videoPath)) {
//     console.error(`Video file not found: ${videoPath}`);
//     return res.status(404).send("Video not found");
//   }

//   const videoSize = fs.statSync(videoPath).size;
//   const CHUNK_SIZE = 10 ** 6; // 1MB
//   const start = Number(range.replace(/\D/g, ""));
//   const end = Math.min(start + CHUNK_SIZE, videoSize - 1);

//   const contentLength = end - start + 1;
//   const headers = {
//     "Content-Range": `bytes ${start}-${end}/${videoSize}`,
//     "Accept-Ranges": "bytes",
//     "Content-Length": contentLength,
//     "Content-Type": "video/mp4",
//   };

//   res.writeHead(206, headers);

//   const videoStream = fs.createReadStream(videoPath, { start, end });
//   videoStream.pipe(res);

//   videoStream.on('error', (streamErr) => {
//     console.error('Stream Error:', streamErr);
//     res.end(streamErr);
//   });
// });






app.post("/prepare-movie", async (req, res) => {
  const { movieId, userId } = req.body;
  
  console.log("Received request to prepare movie:", { movieId, userId });
  
  try {
      // Fetch movie info from the database
      const movieInfo = await db.fetchMovieInfoById(movieId);
      
      console.log("Fetched movie info:", movieInfo);
      
      if (!movieInfo) {
          console.log("No movie info found for id:", movieId);
          return res.status(404).json({ success: false, message: "Movie not found" });
      }
      
      // Store movie info and user info in the session
      req.session.movieInfo = movieInfo;
      req.session.userId = userId;
      
      console.log('Movie info set in session:', req.session.movieInfo);
      
      // Save the session explicitly
      req.session.save((err) => {
          if (err) {
              console.error("Session save error:", err);
              return res.status(500).json({ success: false, message: "Error saving session" });
          }
          console.log('Session saved successfully. Session data:', req.session);
          res.json({ success: true, message: "Movie prepared successfully" });
      });
  } catch (err) {
      console.error("Error in /prepare-movie:", err);
      res.status(500).json({ success: false, message: err.message });
  }
});





app.get("/movie", function (req, res) {
  console.log("Session in /movie:", req.session);
  if (!req.session.movieInfo) {
      console.log("No movie info found in session");
      return res.status(400).send("No movie info in session. Please select a movie first.");
  }
  
  console.log("Movie info found:", req.session.movieInfo);
  res.sendFile(path.join(__dirname, '..', 'Client', 'UPmovie.html'));
});


app.get("/movie-info", (req, res) => {
  console.log("Session in /movie-info:", req.session);
  if (!req.session.movieInfo) {
      console.log("No movie info found in /movie-info");
      return res.status(400).json({ success: false, message: "No movie info in session" });
  }
  
  console.log("Sending movie info:", req.session.movieInfo);
  res.json({
      success: true,
      movieInfo: req.session.movieInfo,
      userId: req.session.userId
  });
});





app.use((req, res, next) => {
  console.log('Session ID:', req.sessionID);
  console.log('Session Data:', req.session);
  next();
});









app.post("/watch-movie", async (req, res) => {
  const { movieId, userId } = req.body;
  
  try {
      // Fetch movie info from the database
      const movieInfo = await db.fetchMovieInfoById(movieId);
      
      // Store movie info and user info in the session
      req.session.movieInfo = movieInfo;
      req.session.userId = userId;
      
      // Redirect to the movie page
      res.redirect("/movie");
  } catch (err) {
      console.log(err);
      res.status(500).json({ success: false, message: err.message });
  }
});

// app.get("/movie", function (req, res) {
//   if (!req.session.movieInfo) {
//       return res.status(400).send("No movie info in session");
//   }
  
//   res.sendFile(path.join(__dirname, '..', 'Client', 'UPmovie.html'));
// });

app.get("/video", function (req, res) {
  const range = req.headers.range;
  if (!range) {
      return res.status(400).send("Requires Range header");
  }
  
  const videoPath = req.session.movieInfo.filepath;
  if (!fs.existsSync(videoPath)) {
      console.error(`Video file not found: ${videoPath}`);
      return res.status(404).send("Video not found");
  }
  
  const videoSize = fs.statSync(videoPath).size;
  const CHUNK_SIZE = 10 ** 6; // 1MB
  const start = Number(range.replace(/\D/g, ""));
  const end = Math.min(start + CHUNK_SIZE, videoSize - 1);
  
  const contentLength = end - start + 1;
  const headers = {
      "Content-Range": `bytes ${start}-${end}/${videoSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": contentLength,
      "Content-Type": "video/mp4",
  };
  
  res.writeHead(206, headers);
  
  const videoStream = fs.createReadStream(videoPath, { start, end });
  videoStream.pipe(res);
  
  videoStream.on('error', (streamErr) => {
      console.error('Stream Error:', streamErr);
      res.end(streamErr);
  });
});


// app.get("/movie-info", (req, res) => {
//   if (!req.session.movieInfo) {
//       return res.status(400).json({ success: false, message: "No movie info in session" });
//   }
  
//   res.json({
//       success: true,
//       movieInfo: req.session.movieInfo,
//       userId: req.session.userId
//   });
// });











app.get('/movie-info/:title', async (request, response) => {
  try {
      const { title } = request.params;
      const result = await db.fetchMovieInfo(title);
      response.json({ data: result });
  } catch (err) {
      console.log(err);
      response.status(500).json({ success: false, message: err.message });
  }
});


// forums api 

// Middleware to check if user is logged in
function isLoggedIn(req, res, next) {
  if (req.headers['user-id']) {
      req.user = { id: req.headers['user-id'] };
      next();
  } else {
      next();
  }
}
// Create a new forum
app.post('/forums', isLoggedIn, (req, res) => {
  if (!req.user) return res.status(403).send('Login required');

  const { title, content } = req.body;
  const user_id = req.user.id;
  db.query('INSERT INTO forums (title, content, user_id) VALUES (?, ?, ?)', [title, content, user_id], (err, result) => {
      if (err) throw err;
      res.send('Forum created');
  });
});


// Get all forums
app.get('/forums', (req, res) => {
  db.query('SELECT * FROM forums', (err, result) => {
      if (err) throw err;
      res.send(result);
  });
});


// Delete a forum
app.delete('/forums/:id', isLoggedIn, (req, res) => {
  if (!req.user) return res.status(403).send('Login required');

  const forum_id = req.params.id;
  db.query('DELETE FROM forums WHERE id = ? AND user_id = ?', [forum_id, req.user.id], (err, result) => {
      if (err) throw err;
      res.send('Forum deleted');
  });
});

// Create a new comment
app.post('/forums/:forumId/comments', isLoggedIn, (req, res) => {
  if (!req.user) return res.status(403).send('Login required');

  const { content } = req.body;
  const forum_id = req.params.forumId;
  const user_id = req.user.id;
  db.query('INSERT INTO comments (forum_id, user_id, content) VALUES (?, ?, ?)', [forum_id, user_id, content], (err, result) => {
    if (err) throw err;
    res.send('Comment created');
  });
});

// Get all comments
app.get('/forums/:id/comments', async (req, res) => {
  try {
    const forumId = req.params.id;
    if (!forumId) {
      return res.status(400).send({ error: 'Forum ID is required' });
    }

    const comments = await db.query('SELECT * FROM comments WHERE forum_id = ?', [forumId]);
    if (comments.length === 0) {
      return res.status(404).send({ message: 'No comments found for this forum' });
    }

    res.send(comments);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Database query failed' });
  }
});

// Delete a comment

app.delete('/comments/:id', isLoggedIn, (req, res) => {
  if (!req.user) return res.status(403).send('Login required');

  const comment_id = req.params.id;
  db.query('DELETE FROM comments WHERE id = ? AND user_id = ?', [comment_id, req.user.id], (err, result) => {
      if (err) throw err;
      res.send('Comment deleted');
  });
});



//code for chatting 

// Send message
app.post('/send', (req, res) => {
  const { from_user_id, to_user_id, message } = req.body;
  if (!from_user_id) {
    res.status(401).json({ success: false, error: "You must be logged in to send a message" });
    return;
  }

  db.query("INSERT INTO messages (from_user_id, to_user_id, message) VALUES (?, ?, ?)", [from_user_id, to_user_id, message], (err, result) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      res.status(200).json({ success: true });
    }
  });
});

// Get messages for user
// Get messages for user
app.get('/messages/:user_id', (req, res) => {
  const user_id = req.params.user_id;
  console.log(`Received request for messages for user ${user_id}`);
  console.log('Request headers:', req.headers);
  console.log('Request query:', req.query);
  console.log('About to execute database query...');

  const queries = [
    db.query("SELECT * FROM messages WHERE to_user_id = ?", [user_id]),
    db.query("SELECT * FROM messages WHERE from_user_id = ?", [user_id])
  ];

  Promise.all(queries)
    .then(([receivedMessages, sentMessages]) => {
      const allMessages = receivedMessages.concat(sentMessages);
      console.log(`Fetched ${allMessages.length} messages for user ${user_id}`);
      console.log(`Preparing response...`);
      console.log('Response data:', allMessages);
      res.json({ messages: allMessages });
      console.log(`Response sent.`);
    })
    .catch(err => {
      console.error(`Error fetching messages: ${err.message}`);
      res.status(500).json({ error: err.message });
    });
});



  app.get('/searchUser/:id', async (req, res) => {
    const id = req.params.id;
    console.log('Received request to search user with id:', id);
  
    if (!id) {
      console.error('No ID provided');
      return res.status(400).json({ success: false, error: 'No ID provided' });
    }
  
    try {
      const result = await db.query("SELECT * FROM user WHERE id = ?", [id]);
      if (result.length > 0) {
        const user = result[0];
        return res.status(200).json({ user });
      } else {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });
// get names for forum 
app.get('/api/users/:userid', async (req, res) => {
  const userId = req.params.userid;
  const query = `SELECT fname, lname FROM user WHERE id = ?`;
  const user = await db.query(query, [userId]);
  console.log(user[0].fname, user[0].lname);
  res.json({ fname: user[0].fname, lname: user[0].lname });
});



// Send message
/*
const defaultUserId = 1;
 app.post('/send', (req, res) => {
  const { to_user_id, message } = req.body;
  const stmt = db.prepare("INSERT INTO messages (from_user_id, to_user_id, message) VALUES (?, ?, ?)");
  stmt.run(defaultUserId, to_user_id, message);
  stmt.finalize();
  res.status(200).json({ success: true });
});*/

// Get messages for user
/*app.get('/messages/:user_id', (req, res) => {
  const user_id = req.params.user_id;
  db.all("SELECT * FROM messages WHERE to_user_id = ?", [user_id], (err, rows) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
      return;
    }
    res.status(200).json({ success: true, messages: rows });
  });
});*/












app.get("/signup.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'signup.html'));
 });

 app.get("/test.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'test.html'));
 });

app.get("/team.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'team.html'));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'index.html'));
});

app.get("/testimonials.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'testimonials.html'));
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'login.html'));
});

app.get("/contacts.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'contacts.html'));
});

app.get("/movies.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'movies.html'));
});

app.get("/products.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'products.html'));
});

app.get("/test.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'test.html'));
});

app.get("/admin.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'admin.html'));
});

app.get("/users.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'Users.html'));
});

app.get("/UserProfile.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'UserProfile.html'));
});

// forums link 
app.get("/forums.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'forums.html'));
});


// chat link 
app.get("/chat.html", (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'chat.html'));
});
app.get("*", (req, res) => {
  res.status(404).send("Page not found");
});

