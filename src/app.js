const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const hbs = require("hbs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();

// Set up view engine
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "/../templates/views"));
hbs.registerPartials(path.join(__dirname, "/../templates/views/partials"));
app.use(express.static(path.join(__dirname, "/../public")));

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up GoogleGenerativeAI
const api_key = process.env.GOOGLE_GENERATIVE_AI_KEY;
const genAI = new GoogleGenerativeAI(api_key);
const generationConfig = { temperature: 0.9, topP: 1, topK: 1, maxOutputTokens: 4096 };

// Temporary in-memory storage (for demonstration, use session or database in production)
let generatedQuestionsWithAnswers = [];

// Route to render the question generation form
app.get("/generate-questions", (req, res) => {
  res.render("generate-questions-form");
});

app.post("/generate-questions", async (req, res) => {
  const { field } = req.body;

  try {
    const prompt = `Generate a set of 10 objective-type questions related to ${field}, along with the correct answers. 
    Each question should have 4 options and the correct answer should be indicated. Format the response as JSON:
    [
      {
        "question": "<Question text>",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctAnswer": "<Correct option>"
      }
    ]`;

    const model = genAI.getGenerativeModel({ model: "gemini-pro", generationConfig });
    const response = await model.generateContent(prompt);

    // Extract text from the response
    const generatedText = response.response ? await response.response.text() : '';
    console.log("Generated Text:", generatedText);

    // Sanitize the generated text by removing markdown code fences
    const cleanedText = generatedText.replace(/```json|```/g, '').trim();
    console.log("Cleaned Text:", cleanedText);

    let questionsWithAnswers = [];
    try {
      questionsWithAnswers = JSON.parse(cleanedText);
      console.log("Parsed Questions with Answers:", questionsWithAnswers);
    } catch (jsonError) {
      console.error("Failed to parse JSON:", jsonError);
      return res.status(500).send("Invalid JSON response from the AI model.");
    }

    // Store the questionsWithAnswers in memory
    generatedQuestionsWithAnswers = questionsWithAnswers;

    // Render the questions page with the generated questions
    res.render("questions", { field, questionsWithAnswers , cleanedText });
  } catch (error) {
    console.error("Error generating questions:", error);
    res.status(500).send("Failed to generate questions");
  }
});

// Route to handle answer submission
// Route to handle answer submission
// Route to handle answer submission
app.post("/submit-answers", async (req, res) => {
  console.log("Request received at /submit-answers");
  const answers = req.body.answers || [];
  const timings = req.body.timings || {};
  const cleanedText = req.body.cleanedtext || '';
  console.log("Answers received:", answers);
  console.log("Timings received:", timings);

  try {
    let verificationResults = {};
    let correctCount = 0;
    let incorrectCount = 0;

    // Compare the user's answers with the correct answers
    generatedQuestionsWithAnswers.forEach((qna, index) => {
      const userAnswer = answers[index];
      const correctAnswer = qna.correctAnswer;

      if (userAnswer === correctAnswer) {
        verificationResults[`q${index}`] = 'correct';
        correctCount++;
      } else {
        verificationResults[`q${index}`] = 'incorrect';
        incorrectCount++;
      }
    });

    const timeLabels = Object.keys(timings).map((key, index) => `Question ${index + 1}`);
    const timeData = Object.values(timings);

    // Calculate pass/fail
    const passedCount = correctCount >= 7 ? 1 : 0;
    const failedCount = 1 - passedCount;

    // Calculate score (percentage)
    const totalQuestions = generatedQuestionsWithAnswers.length;
    const score = (correctCount / totalQuestions) * 100;

    // Placeholder feedback generation logic
    const feedbackData = {
      feedback: generatedQuestionsWithAnswers.map((qna, index) => {
        return verificationResults[`q${index}`] === 'correct' ? `Well done on question ${index + 1}.` : `Review the topic for question ${index + 1}.`;
      }),
      additionalTests: ["Practice more on weak areas."],
      additionalCourses: ["Consider taking an advanced course in the field."]
    };

    // Send the cleanedText and answers to Gemini for career guidance
    const geminiResponse = await genAI.getGenerativeModel({ model: "gemini-pro", generationConfig }).generateContent(`Based on the following answers and text, provide career guidance first these are the questions with their respective correct answers : \n\n${cleanedText}\n\nUser Answers These are the answers selected by the user for these questions : ${JSON.stringify(answers)} \n\n the number of correct answer in this are ${correctCount} and the number of incorrect answers are ${incorrectCount} \n\n the user took ${timeData} seconds to answer each question\n\n in the guidance just give where the user is weak if he is and what he can do to improve his skills sugest some courses or some books to read in the starting jsut give the score to the user in words like good ok bad etc`);

    // Extract and clean Gemini response
    const geminiText = geminiResponse.response ? await geminiResponse.response.text() : '';
    const cleanedGeminiText = geminiText.replace(/```|```json/g, '').trim();

    // Render the result page with the guidance from Gemini
    res.render("result", {
      field: req.body.field || 'N/A',
      timeLabels: JSON.stringify(timeLabels),
      timeData: JSON.stringify(timeData),
      accuracyLabels: JSON.stringify(['Correct', 'Incorrect']),
      accuracyData: JSON.stringify([correctCount, incorrectCount]),
      cleanedText,
      geminiGuidance: cleanedGeminiText,
      correctCount,
      incorrectCount,
      score, // Pass the score to the result page
      feedbackData,
      passedCount,
      failedCount,
    });

  } catch (error) {
    console.error("Error during answer submission:", error);
    res.status(500).send("Failed to submit answers");
  }
});



hbs.registerHelper('incrementIndex', function(index) {
  return index + 1;
});

hbs.registerHelper('json', function(context) {
  return JSON.stringify(context);
});

// Start the server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
