const express = require("express");
const path = require("path");
const hbs = require("hbs");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");

const User = require("./models/User");
const { GoogleGenerativeAI } = require("@google/generative-ai");
let  interest1 ; 
let interest2 ; 
let interest3 ;
const app = express();
const session = require("express-session");
const bcrypt = require('bcrypt');

// Set up GoogleGenerativeAI
const api_key = "AIzaSyCSx1UbyW73TVEc_-XR9JGuKchXT69idBE"; // Replace with your API key
const genAI = new GoogleGenerativeAI(api_key);
const generationConfig = { temperature: 0.9, topP: 1, topK: 1, maxOutputTokens: 4096 };
// ...
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
// Get Generative Model
const model = genAI.getGenerativeModel({ model: "gemini-pro", generationConfig });

var userName="good";
// Express setup
app.set("views", path.join(__dirname, "/../templates/views"));
app.set("view engine", "hbs");
hbs.registerPartials(path.join(__dirname, "/../templates/views/partials"));
app.use(express.static(path.join(__dirname, "/../public")));
app.use(
    session({
      secret: "your-secret-key", // Replace with a strong and secure key
      resave: true,
      saveUninitialized: true,
    })
);
const ChatSchema = new mongoose.Schema({
  username: String,
  question: String,
  answer: String
});

const CardSchema = new mongoose.Schema({
  username: String,
  projectName: String,
  projectDescription: String
});

// Define a model using the CardSchema
const Card = mongoose.model('Card', CardSchema);
function removeStars(inputString) {
  // Use the replace method with a regular expression to remove all "*" symbols
  const cleanedString = inputString.replace(/\*\*/g, '').replace(/\*/g, '<br>');
  return cleanedString;
}

// Define a model
const Chat = mongoose.model('Chat', ChatSchema);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.render("index", { title: "Catharsis" });
});

app.get("/register", (req, res) => {
  res.render("register");
});
app.get("/premium", (req, res) => {
  res.render("premium");
});

app.get("/login", (req, res) => {
  res.render("login");
});
app.get("/interest", (req, res) => {
  res.render("interest");
});
app.get("/dashboard", (req, res) => {
  res.render("dashboard", {userName});
});

// app.post("/dashboard", (req, res)=>{
//   userName="Hello";
// })
// Handle user responses to predefined questions
app.post('/handle-interest', async (req, res) => {
  const { interest1, interest2, interest3 } = req.body;

  try {
    // Create a new document and save it to MongoDB
    const chat = new Chat({ username: userName, question: interest1, answer: `${interest2}, ${interest3}` });
    await chat.save();
    res.status(200).send('Data saved successfully');
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).send('Error saving data');
  }
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    const existingUser = await User.findOne({ username });

    if (existingUser) {
      return res.render("register", { error: "User already exists" });
    }

    const newUser = new User({ username, password });
    await newUser.save();
    res.redirect("/login");
  } catch (error) {
    console.error(error);
    res.render("register", { error: "Registration failed" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });

    if (!user) {
      return res.render("login", { error: "Invalid username or password" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.render("login", { error: "Invalid username or password" });
    }

    req.session.user = user.username;
    userName=user.username;
    console.log("login successfully");
    res.redirect("/interest");
  } catch (error) {
    console.error(error);
    res.render("login", { error: "Login failed" });
  }
});

app.get('/ask', async (req, res) => {
  // Retrieve interests from the query parameters
  const { interest1, interest2, interest3 } = req.query;

  if (!interest1 || !interest2 || !interest3) {
    return res.status(400).send('Interests not found in query parameters');
  }

  try {
    // Retrieve previous chat history from the database
    const previousChat = await Chat.find({ username: userName }).sort({ _id: -1 }).limit(5); // Assuming you want to retrieve the last 5 chats

    let prompt ="Hello Gemini, You will suggest career and give guidance to the student based on the certain question that are asked to the user and are given below. Please only give help related to the career and suggest action plans."
    prompt = prompt + " Previous chat history:\n";
    console.log(prompt);
    if (previousChat.length > 0) {
      // Generate prompt including previous questions and answers
      previousChat.forEach((chat, index) => {
        prompt += `${index + 1}. Question: ${chat.question}\n`;
        prompt += `   Answer: ${chat.answer}\n`;
      });
    } else {
      // If no previous chat history exists
      prompt += `No previous chat history found.\n`;
    }

    // Add the new question to the prompt
    prompt += `\nNew question: Hello Gemini, You will suggest career and give guidance to the student based on the certain question that are asked to the user and are given below. Please only give help related to the career and suggest career action plans: Hobby and activity that i do in my free time is ${interest1}, I am passionate about ${interest2} and I like ${interest3}`;

    // Generate career guidance based on the stored interests and previous chat history
    const response = await model.generateContent(prompt);

    let guidance = response.response.text();

    // Remove "*" symbols from the guidance
    guidance = removeStars(guidance);
    console.log(guidance);
    // Render the "ask" template and pass the guidance and previous chat history as variables
    res.render('ask', { guidance, previousChat });
  } catch (error) {
    console.error('Error fetching previous chat history:', error);
    res.status(500).send('Error fetching previous chat history');
  }
});
app.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;

    // Retrieve previous chat history of the current user from the database
    const previousChat = await Chat.find({ username: userName }).sort({ _id: -1 }).limit(5);

    // Create a prompt that includes the previous questions and answers
    let prompt = '';
    if (previousChat.length > 0) {
      prompt += 'Previous chat history:\n';
      previousChat.forEach(chat => {
        prompt += `Question: ${chat.question}\nAnswer: ${chat.answer}\n\n`;
      });
    } else {
      prompt += 'No previous chat history found.\n\n';
    }

    // Add the current question to the prompt
    prompt += `New question:\n${question}`;

    // Generate response based on the prompt
    const result = await model.generateContent(prompt);
    const responseText = result.response.text(); // Get the text content from the response
    const cleanedResponseText = removeStars(responseText); // Remove stars from the text

    // Save the current question and generated response to MongoDB
    const chat = new Chat({
      username: userName,
      question: question,
      answer: responseText
    });
    await chat.save();

    res.json({ response: cleanedResponseText });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Content generation failed" });
  }
});

app.post('/process-form', (req, res) => {
  // Retrieve form data from the request body
  const { interest1, interest2, interest3 } = req.body;

  // Redirect the user to the /ask route with the interests in the query parameters
  res.redirect(`/ask?interest1=${interest1}&interest2=${interest2}&interest3=${interest3}`);
});
// Database connection
const uri = "mongodb+srv://nepalsss008:hacknova@cluster0.u2cqpgp.mongodb.net/";
// Replace with your MongoDB Atlas URI

async function connect() {
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

app.post("/add-card", async (req, res) => {
  const { projectName, projectDescription } = req.body;
  console.log("Received Project Name:", projectName);
  console.log("Received Project Description:", projectDescription);
  // console.log(req.body); 

  try {
      // Save card details using the Card model
      const card = new Card({ username: userName, projectName, projectDescription });
      await card.save();
      console.log("Card saved successfully");
      res.redirect("/dashboard"); // Redirect to dashboard or any other page
  } catch (error) {
      console.error('Error saving card:', error);
      res.status(500).send('Error saving card');
  }
});

connect();

const port = process.env.PORT || 4000; 
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
