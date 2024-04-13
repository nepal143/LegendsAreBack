function convertToBulletPoints(text) {
     const lines = text.split('\n').filter(line => line.trim() !== ''); // Split text into lines and filter out empty lines
     const formattedLines = lines.map(line => {
         if (line.startsWith('*')) {
             const content = line.substring(2).trim(); // Remove '*' and leading space
             return `- ${content}`;
         } else if (line.startsWith('**')) {
             const category = line.substring(2, line.indexOf(':')).trim(); // Extract category name
             const content = line.substring(line.indexOf(':') + 1).trim(); // Extract content after ':'
             return `- **${category}**: ${content}`;
         }
         return ''; // Ignore lines that don't match the expected format
     }).filter(line => line !== ''); // Filter out empty lines
 
     return formattedLines.join(' '); // Join formatted lines into a single string with line breaks
 }
 
 // Original text with stars indicating career suggestions and action plan
 const originalText = `
 *Career Suggestions:**
 
 * **Automotive Engineer:** Your passion for riding bikes suggests an interest in mechanics and engineering. This role involves designing, developing, and testing vehicles.
 * **Bicycle Mechanic:** Your hands-on experience with bikes could translate into a career in bicycle repair and maintenance.
 * **Computer Programmer:** Your interest in computers opens up numerous programming career paths, such as software development, web development, and mobile app design.
 * **Web Designer:** Combine your computer skills with your artistic talents to create visually appealing and functional websites.
 * **Graphic Designer:** Your painting hobby demonstrates your creativity and design sense, making you a potential candidate for careers in graphic design, advertising, or branding.
 
 **Career Action Plan:**
 
 1. **Explore Courses and Programs:** Research universities and vocational schools that offer programs in automotive engineering, bicycle mechanics, computer programming, web design, or graphic design.
 2. **Gain Practical Experience:** Seek internships or volunteer opportunities in fields related to your interests. This will provide you with hands-on experience and networking opportunities.
 3. **Develop Skills:** Take online courses or workshops to enhance your technical and artistic abilities. Consider joining clubs or attending industry events to connect with professionals and learn about industry trends.
 4. **Tailor Your Resume and Portfolio:** Highlight your skills and experience in a resume and portfolio that showcase your capabilities in automotive engineering, bicycle mechanics, computer programming, web design, or graphic design.
 5. **Attend Job Fairs and Network:** Participate in job fairs and networking events to connect with potential employers and learn about job opportunities.
 6. **Stay Up-to-Date:** Keep abreast of industry advancements and emerging technologies by reading industry publications and attending conferences.
 `;
 
 // Call the function with the original text
 const formattedText = convertToBulletPoints(originalText);
 
 // Display the formatted text
 console.log(formattedText);