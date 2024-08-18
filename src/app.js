const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const hbs = require("hbs");
const bcrypt = require("bcrypt");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const session = require("express-session");
const flash = require("connect-flash");
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log("Connected to MongoDB");
}).catch(err => {
  console.error("MongoDB connection error:", err);
});

// Define User Schema
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  tests: [
    {
      field: String,
      questions: [
        {
          question: String,
          options: [String],
          correctAnswer: String,
          userAnswer: String,
        }
      ],
      score: Number,
      passed: Boolean,
      timings: [Number],
      date: { type: Date, default: Date.now }
    }
  ]
});

// Compile model from schema
const User = mongoose.model("User", userSchema);

// Set up view engine
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "/../templates/views"));
hbs.registerPartials(path.join(__dirname, "/../templates/views/partials"));
app.use(express.static(path.join(__dirname, "/../public")));

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up session and flash
app.use(session({
  secret: 'yourSecretKey',
  resave: false,
  saveUninitialized: false,
}));
app.use(flash());

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport configuration for authentication
passport.use(new LocalStrategy(
  { usernameField: 'username', passwordField: 'password' },  // Explicitly specify fields
  async (username, password, done) => {
    try {
      const user = await User.findOne({ username });
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Route for the home page (redirect to login if not authenticated)
app.get("/", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login");
  }
  res.redirect("/home");
});

// Route to render the login form
app.get("/login", (req, res) => {
  res.render("login", { message: req.flash("error") });
});

// Route to render the home page
app.get("/home", (req, res) => {
  res.render("index");
});

// Route to handle login logic
app.post("/login", passport.authenticate("local", {
  successRedirect: "/home",
  failureRedirect: "/login",
  failureFlash: true
}));

// Route to render the registration form
app.get("/register", (req, res) => {
  res.render("register");
});

// Route to handle registration logic
app.post("/register", async (req, res) => {
  const { username, password, name, email } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, name, email });
    await newUser.save();
    res.redirect("/login");
  } catch (err) {
    console.error("Registration error:", err);
    res.redirect("/register");
  }
});

// Middleware to protect routes
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

// Set up GoogleGenerativeAI
const api_key = process.env.GOOGLE_GENERATIVE_AI_KEY;
const genAI = new GoogleGenerativeAI(api_key);
const generationConfig = { temperature: 0.9, topP: 1, topK: 1, maxOutputTokens: 4096 };

// Temporary in-memory storage (for demonstration, use session or database in production)
let generatedQuestionsWithAnswers = [];

// Route to render the question generation form
app.get("/generate-questions", ensureAuthenticated, (req, res) => {
  res.render("generate-questions-form");
});

app.post("/generate-questions", ensureAuthenticated, async (req, res) => {
  const { field } = req.body;

  try {
    const prompt = `Generate a set of 10 objective-type questions related to ${field}, along with the correct answers...
    Format the response as JSON:
    [
      {
        "question": "<Question text>",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctAnswer": "<Correct option>"
      }
    ]`;

    const model = genAI.getGenerativeModel({ model: "gemini-pro", generationConfig });
    const response = await model.generateContent(prompt);

    const generatedText = response.response ? await response.response.text() : '';
    const cleanedText = generatedText.replace(/```json|```/g, '').trim();

    let questionsWithAnswers = [];
    try {
      questionsWithAnswers = JSON.parse(cleanedText);
    } catch (jsonError) {
      console.error("Failed to parse JSON:", jsonError);
      return res.status(500).send("Invalid JSON response from the AI model.");
    }

    // Store the questionsWithAnswers in memory
    generatedQuestionsWithAnswers = questionsWithAnswers;

    // Save the generated questions under the user's test data
    const user = req.user;
    user.tests.push({
      field,
      questions: questionsWithAnswers.map(qna => ({
        question: qna.question,
        options: qna.options,
        correctAnswer: qna.correctAnswer,
        userAnswer: null // Placeholder for user answer
      })),
      score: null, // Placeholder for score
      passed: null, // Placeholder for pass/fail status
      timings: [],
      date: new Date()
    });
    await user.save();

    // Render the questions page with the generated questions
    res.render("questions", { field, questionsWithAnswers, cleanedText });
  } catch (error) {
    console.error("Error generating questions:", error);
    res.status(500).send("Failed to generate questions");
  }
});

// Route to handle answer submission
app.post("/submit-answers", ensureAuthenticated, async (req, res) => {
  const answers = req.body.answers || [];
  const timings = req.body.timings || {};
  const cleanedText = req.body.cleanedtext || '';

  try {
    let verificationResults = {};
    let correctCount = 0;
    let incorrectCount = 0;

    // Find the test data associated with the user
    const user = req.user;
    const test = user.tests[user.tests.length - 1]; // Get the most recent test

    // Compare the user's answers with the correct answers
    test.questions.forEach((qna, index) => {
      const userAnswer = answers[index];
      const correctAnswer = qna.correctAnswer;

      if (userAnswer === correctAnswer) {
        verificationResults[`q${index}`] = 'correct';
        correctCount++;
      } else {
        verificationResults[`q${index}`] = 'incorrect';
        incorrectCount++;
      }
      qna.userAnswer = userAnswer; // Save the user's answer
    });

    // Update test data with results
    test.score = (correctCount / test.questions.length) * 100;
    test.passed = correctCount >= 7;
    test.timings = Object.values(timings);

    await user.save();

    const timeLabels = Object.keys(timings).map((key, index) => `Question ${index + 1}`);
    const timeData = Object.values(timings);

    // Render the result page with the guidance from Gemini
    res.render("result", {
      field: req.body.field || 'N/A',
      timeLabels: JSON.stringify(timeLabels),
      timeData: JSON.stringify(timeData),
      correctCount,
      incorrectCount,
      passedCount: test.passed ? 1 : 0,
      failedCount: test.passed ? 0 : 1,
      score: test.score,
      feedbackData: {
        feedback: test.questions.map((qna, index) => {
          return verificationResults[`q${index}`] === 'correct' ? `Well done on question ${index + 1}.` : `Review the topic for question ${index + 1}.`;
        }),
        additionalTests: ["Practice more on weak areas."],
        additionalCourses: ["Consider taking an advanced course in the field."]
      },
      careerGuidance: '' // Placeholder for career guidance text
    });

  } catch (error) {
    console.error("Error submitting answers:", error);
    res.status(500).send("Failed to submit answers");
  }
});
hbs.registerHelper('incrementIndex', function (index) {
  return parseInt(index, 10) + 1;
});
// Start the server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
