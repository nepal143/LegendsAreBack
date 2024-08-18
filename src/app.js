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
const api_key = process.env.GOOGLE_GENERATIVE_AI_KEY;
const genAI = new GoogleGenerativeAI(api_key);
const generationConfig = { temperature: 0.9, topP: 1, topK: 1, maxOutputTokens: 4096 };
let generatedQuestionsWithAnswers = [];

app.get("/ask" , (req, res) => {
  res.render("ask");
}); 
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

    // Enhanced cleanup: Remove any problematic characters or symbols
    const cleanedText = generatedText
      .replace(/```json|```/g, '')  // Remove markdown JSON blocks
      .replace(/\*\*|\*/g, '')  // Remove asterisks
      .replace(/(\r\n|\n|\r)/gm, '')  // Remove line breaks
      .replace(/",\s*}/g, '"}')  // Fix trailing commas before closing braces
      .trim();

    console.log("Cleaned Text:", cleanedText);  // Log cleaned text for debugging

    let questionsWithAnswers = [];
    try {
      questionsWithAnswers = JSON.parse(cleanedText);
    } catch (jsonError) {
      console.error("Failed to parse JSON:", jsonError.message);

      // Attempt to recover by cleaning up malformed entries
      const cleanedEntries = cleanedText.split('},').map(entry => entry.trim() + '}');
      questionsWithAnswers = cleanedEntries
        .map(entry => {
          try {
            return JSON.parse(entry);
          } catch {
            return null;
          }
        })
        .filter(entry => entry !== null);  // Filter out null (malformed) entries

      if (questionsWithAnswers.length === 0) {
        return res.status(500).send("Invalid JSON response from the AI model.");
      }
    }

    // Get the authenticated user
    const user = req.user;

    // Create a test entry and save it to the user's tests
    const testEntry = {
      field: field,
      questions: questionsWithAnswers.map(qna => ({
        question: qna.question,
        options: qna.options,
        correctAnswer: qna.correctAnswer,
        userAnswer: null // Placeholder for user answer
      })),
      score: null,
      passed: null,
      timings: [],
      date: new Date()
    };

    user.tests.push(testEntry);
    await user.save();

    // Render the questions page with the generated questions
    res.render("questions", { field, questionsWithAnswers, cleanedText });
  } catch (error) {
    console.error("Error generating questions:", error);
    res.status(500).send("Failed to generate questions");
  }
});
app.get("/test-details/:id", ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user;
    const testId = req.params.id;
    const test = user.tests.id(testId);

    if (!test) {
      return res.status(404).send("Test not found");
    }

    res.render("test-details", { test });
  } catch (error) {
    console.error("Error fetching test details:", error);
    res.status(500).send("Error fetching test details");
  }
});

hbs.registerHelper('pluck', function(array, key) {
  return array.map(item => item[key]);
});
hbs.registerHelper('json', function(context) {
  return JSON.stringify(context);
});
app.get('/dashboard', async (req, res) => {
  try {
      const user = await User.findById(req.user._id).populate('tests');
      res.render('dashboard', { user });
  } catch (error) {
      console.error(error);
      res.status(500).send('Server Error');
  }
});
// Route to handle answer submission
app.post("/submit-answers", ensureAuthenticated, async (req, res) => {
  const { answers, timings, field } = req.body;

  try {
    let correctCount = 0;
    let incorrectCount = 0;
    const user = req.user;
    const test = user.tests[user.tests.length - 1]; // Get the most recent test

    // Compare user's answers with correct answers and calculate score
    test.questions = test.questions.map((qna, index) => {
      const userAnswer = answers[index];
      const correctAnswer = qna.correctAnswer;

      if (userAnswer === correctAnswer) {
        correctCount++;
      } else {
        incorrectCount++;
      }

      return {
        ...qna,
        userAnswer: userAnswer || null, // Ensure null is used if no answer
      };
    });

    test.score = (correctCount / test.questions.length) * 100;
    test.passed = correctCount >= 7;
    test.timings = Object.values(timings);
    await user.save();

    // Generate feedback data based on performance
    const feedbackData = {
      feedback: test.questions.map((qna, index) => {
        return qna.userAnswer === qna.correctAnswer
          ? `Well done on question ${index + 1}.`
          : `Review the topic for question ${index + 1}.`;
      }),
      additionalTests: ["Practice more on weak areas."],
      additionalCourses: ["Consider taking an advanced course in the field."],
    };

    const timeLabels = Object.keys(timings).map((key, index) => `Question ${index + 1}`);
    const timeData = Object.values(timings);

    // Save the feedback in the test entry
    test.feedbackData = feedbackData;
    await user.save();

    // Render the result page with the feedback
    res.render("result", {
      field: field || 'N/A',
      timeLabels: JSON.stringify(timeLabels),
      timeData: JSON.stringify(timeData),
      correctCount,
      incorrectCount,
      passedCount: test.passed ? 1 : 0,
      failedCount: test.passed ? 0 : 1,
      score: test.score,
      feedbackData,
    });

  } catch (error) {
    console.error("Error submitting answers:", error);
    res.status(500).send("Failed to submit answers");
  }
});
hbs.registerHelper('incrementIndex', function (index) {
  return parseInt(index, 10) + 1;
});
app.get('/premium', (req, res) => {
  res.render('premium');
}); 
// Start the server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
