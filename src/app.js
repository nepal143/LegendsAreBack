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
const api_key = "AIzaSyAWFrwuAkezZ7k62h0tqQGO-3odML_Edek"; // Replace with your API key
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
  cleanedString="";
  for(let i=0;i<inputString.length;i++){
    if(inputString[i]>='0' && inputString[i]<='9' && inputString[i+1]=='.'){
      cleanedString+="<br>";
    }
      cleanedString+=inputString[i];
    
  }
  substr="Career Action Plan"
  if(inputString.includes(substr)){
  let a=inputString.indexOf(substr);
   str1=cleanedString.substring(0,a);
   str2=cleanedString.substring(a+18);
   cleanedString=str1+"<br>"+"<b>"+"Career Action Plan"+"</b>"+str2;

  }
  cleanedString = cleanedString.replace(/\*\*/g, '').replace(/\*/g, '<br>');
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
app.get("/dashboard", async (req, res) => {
  try {
    // Fetch the user's projects from the database
    const userProjects = await Card.find({ username: userName }); // Assuming Card is your Mongoose model for projects

    // Render the dashboard template with the user's projects data
    res.render("dashboard", { userName, projects: userProjects });
  } catch (error) {
    console.error("Error fetching user's projects:", error);
    res.status(500).send("Error fetching user's projects");
  }
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
  // try {
  //     let prompt = "Hello Gemini, You will suggest career and give guidance to the student based on the questions asked to the user. Please provide help related to career and suggest action plans.";

  //     // Generate career guidance based on the prompt
  //     const response = await model.generateContent(prompt);

  //     // Log the response to see its structure
  //     console.log('Response from model.generateContent:', response);

  //     // Extract and validate guidance text
  //     let guidance;
  //     if (response && typeof response.response === 'string') {
  //         guidance = response.response;
  //     } else if (response && response.response && typeof response.response.text === 'function') {
  //         guidance = await response.response.text(); // Await the text if it's a function
  //     } else {
  //         throw new Error('Expected response to be a string or a text function');
  //     }

  //     // Remove "*" symbols from the guidance if present
  //     guidance = guidance.replace(/\*/g, '');

  //     console.log('Guidance:', guidance);

  //     // Render the "ask" template and pass the guidance as a variable
  //     res.render('ask', { guidance });
  // } catch (error) {
  //     console.error('Error generating guidance:', error);
  //     // Fallback guidance message or error display
  //     res.render('ask', { guidance: "Sorry, we couldn't generate guidance at this moment. Please try again later." });
  // }
  res.render('ask')
});
function formatGuidanceText(text) {
  // Split text into lines
  const lines = text.split('\n');

  // Initialize HTML content
  let htmlContent = '<div style="font-family: Arial, sans-serif; line-height: 1.6;">';

  // Iterate through each line to format
  lines.forEach(line => {
    if (line.startsWith('**')) {
      // Section headers
      if (line.includes(':')) {
        const [title, description] = line.split(':');
        htmlContent += `<h2 style="color: #2c3e50;">${title.replace('**', '').trim()}</h2><p>${description.trim()}</p>`;
      } else {
        htmlContent += `<h3 style="color: #2980b9;">${line.replace('**', '').trim()}</h3>`;
      }
    } else if (line.startsWith('* ')) {
      // Bullet points
      htmlContent += `<ul><li>${line.substring(2).trim()}</li></ul>`;
    } else {
      // Regular text
      htmlContent += `<p>${line.trim()}</p>`;
    }
  });

  htmlContent += '</div>';

  return htmlContent;
}

// POST API to handle user's question
app.post('/ask', async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'No question provided' });
  }

  console.log('Received question:', question);

  try {
    // Generate career guidance based on the user's question
    const guidanceResponse = await model.generateContent(question);
    console.log('Guidance response:', guidanceResponse);

    // Extract text from the response
    const guidanceText = guidanceResponse.response.text();

    // Format the response text
    const formattedText = formatGuidanceText(guidanceText);

    // Send the formatted response back to the client
    res.json({ response: formattedText });

  } catch (error) {
    console.error('Error generating career guidance:', error);
    res.status(500).json({ error: 'Failed to generate guidance' });
  }
});



let bookmarks=[]

app.post('/api/bookmarks', async (req, res) => {
  try {
      const { answer } = req.body;
      bookmarks.push({answer});
      await bookmark.save();
      res.status(201).json({ message: 'Bookmark added successfully' });
  } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
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
