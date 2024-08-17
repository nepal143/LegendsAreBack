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

// Middleware to parse JSON
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up GoogleGenerativeAI
const api_key = process.env.GOOGLE_GENERATIVE_AI_KEY;
const genAI = new GoogleGenerativeAI(api_key);
const generationConfig = { temperature: 0.9, topP: 1, topK: 1, maxOutputTokens: 4096 };

// Route to render the question generation form
app.get("/generate-questions", (req, res) => {
  res.render("generate-questions-form");
});

app.post("/generate-questions", async (req, res) => {
  const { field } = req.body;

  try {
    const prompt = `Generate a set of 10 objective-type questions related to ${field}. 
    Each question should have 4 options and should be formatted as JSON:
    [
      {
        "question": "<Question text>",
        "options": ["Option A", "Option B", "Option C", "Option D"]
      }
      // Ensure to include 10 questions
    ]
    Please ensure the output is a valid JSON array.`;

    const model = genAI.getGenerativeModel({ model: "gemini-pro", generationConfig });
    const response = await model.generateContent(prompt);

    const generatedText = response.response ? await response.response.text() : '';
    console.log("Generated Text:", generatedText);

    const cleanedText = generatedText.replace(/^```json\s*|\s*```$/g, '');
    console.log("Cleaned Text:", cleanedText);

    let questions = [];
    try {
      questions = JSON.parse(cleanedText);
      console.log("Parsed Questions:", questions);
    } catch (jsonError) {
      console.error("Failed to parse JSON:", jsonError);
      return res.status(500).send("Invalid JSON response from the AI model.");
    }

    res.render("questions", { field, questions });
  } catch (error) {
    console.error("Error generating questions:", error);
    res.status(500).send("Failed to generate questions");
  }
});

// Route to handle answer submission
app.post("/submit-answers", async (req, res) => {
  const answers = req.body.answers || [];
  let timings = req.body.timings || {};

  if (typeof timings === 'string') {
    try {
      timings = JSON.parse(timings);
    } catch (error) {
      return res.status(400).send("Invalid timings format");
    }
  }

  console.log("Submitted Answers:", answers);
  console.log("Submitted Timings:", timings);

  try {
    if (!Array.isArray(answers) || typeof timings !== 'object' || Array.isArray(timings)) {
      throw new Error("Invalid data format: 'answers' is not an array or 'timings' is not an object");
    }

    if (answers.length === 0 || Object.keys(timings).length === 0) {
      throw new Error("Answers or timings are empty or incorrectly formatted");
    }

    for (const key in timings) {
      if (isNaN(timings[key]) || timings[key] < 0) {
        throw new Error(`Invalid timing value for question ${key}`);
      }
    }

    const verificationPrompt = `For each of the following questions, determine whether the provided answer is correct. 
    Here are the questions and answers:
    ${answers.map((answer, index) => `Question ${index + 1}: [Insert the text of question ${index + 1}] - Answer: ${answer}`).join('\n')}
    For each question, provide a response in the format: "Question X: [Correct/Incorrect]"`;

    const verificationModel = genAI.getGenerativeModel({ model: "gemini-pro", generationConfig });
    const verificationResponse = await verificationModel.generateContent(verificationPrompt);

    const verificationText = verificationResponse.response ? await verificationResponse.response.text() : '';
    console.log("Verification Text:", verificationText);

    let verificationResults = {};
    const lines = verificationText.split('\n');
    lines.forEach(line => {
      const match = line.match(/Question (\d+): (Correct|Incorrect)/);
      if (match) {
        verificationResults[`q${parseInt(match[1]) - 1}`] = match[2] === 'Correct' ? 'correct' : 'incorrect';
      }
    });

    const feedbackPrompt = `Based on the following answers and their correctness, provide detailed feedback and suggest additional tests or courses to improve. The answers are: ${JSON.stringify(answers)}. The correctness of the answers is: ${JSON.stringify(verificationResults)}. 
    Format the response as follows:
    - Feedback for each question.
    - Additional Tests:
      - Test 1
      - Test 2
    - Additional Courses:
      - Course 1
      - Course 2`;

    const feedbackResponse = await verificationModel.generateContent(feedbackPrompt);

    const feedbackText = feedbackResponse.response ? await feedbackResponse.response.text() : '';
    console.log("Feedback Text:", feedbackText);

    let feedbackData = {
        feedback: [],
        additionalTests: [],
        additionalCourses: []
    };

    const feedbackMatch = feedbackText.match(/Feedback:\s*([\s\S]*?)(?:Additional Tests:|Additional Courses:|$)/);
    const testsMatch = feedbackText.match(/Additional Tests:\s*([\s\S]*?)(?:Additional Courses:|$)/);
    const coursesMatch = feedbackText.match(/Additional Courses:\s*([\s\S]*)/);

    if (feedbackMatch) {
        feedbackData.feedback = feedbackMatch[1].trim().split('\n').map(line => line.trim()).filter(line => line);
    }

    if (testsMatch) {
        feedbackData.additionalTests = testsMatch[1].trim().split('\n').map(line => line.trim()).filter(line => line);
    }

    if (coursesMatch) {
        feedbackData.additionalCourses = coursesMatch[1].trim().split('\n').map(line => line.trim()).filter(line => line);
    }

    const timeLabels = [];
    const timeData = [];
    const accuracyLabels = ['Correct', 'Incorrect'];
    let correctCount = 0;
    let incorrectCount = 0;

    Object.keys(timings).forEach((questionId, index) => {
        const timeSpent = timings[questionId];
        timeLabels.push(`Question ${index + 1}`);
        timeData.push(timeSpent);

        if (verificationResults[questionId] === 'correct') {
            correctCount++;
        } else {
            incorrectCount++;
        }
    });

    const accuracyData = [correctCount, incorrectCount];

    // Calculate the score
    const passedCount = correctCount >= 7 ? 1 : 0;  // Assuming passing score is 7 or more correct answers
    const failedCount = 1 - passedCount;

    res.render("result", {
        field: req.body.field || 'N/A',
        timeLabels: JSON.stringify(timeLabels),
        timeData: JSON.stringify(timeData),
        accuracyLabels: JSON.stringify(accuracyLabels),
        accuracyData: JSON.stringify(accuracyData),
        correctCount, 
        incorrectCount, 
        feedbackData,
        passedCount,
        failedCount
    });
  } catch (error) {
    console.error("Error generating feedback:", error);
    res.status(500).send("Failed to generate feedback");
  }
});

// Start the server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
