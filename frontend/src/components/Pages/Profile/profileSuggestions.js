// Starter suggestions, not an exhaustive directory. All fields accept custom entries.
export const SCHOOLS = [
    'Georgia Institute of Technology', 'University of Texas at Dallas', 'Texas A&M University',
    'University of Texas at Austin', 'University of Georgia', 'Georgia State University',
    'Stanford University', 'Massachusetts Institute of Technology', 'Carnegie Mellon University',
    'University of California, Berkeley', 'University of California, Los Angeles',
    'University of California, San Diego', 'University of Southern California',
    'University of Washington', 'University of Michigan', 'University of Illinois Urbana-Champaign',
    'Purdue University', 'Cornell University', 'Columbia University', 'Harvard University',
    'Princeton University', 'New York University', 'Northeastern University', 'Boston University',
    'Arizona State University', 'University of Florida', 'University of Maryland',
    'University of Toronto', 'University of Waterloo', 'University of British Columbia',
    'University of Oxford', 'University of Cambridge', 'Imperial College London',
    'National University of Singapore', 'Nanyang Technological University',
];
const majors = ['Computer Science', 'Software Engineering', 'Computer Engineering',
    'Electrical Engineering', 'Mechanical Engineering', 'Data Science', 'Artificial Intelligence',
    'Information Technology', 'Information Systems', 'Cybersecurity', 'Mathematics',
    'Statistics', 'Physics', 'Business Administration', 'Economics', 'Design', 'Biology', 'Chemistry'];
export const DEGREES = [...majors, ...['Bachelor of Science', 'Bachelor of Arts', 'Master of Science', 'Doctor of Philosophy']
    .flatMap(degree => majors.map(major => `${degree} in ${major}`)), 'Associate Degree', 'Master of Business Administration'];
export const JOB_TITLES = ['Software Engineer', 'Software Engineer I', 'Software Engineer II',
    'Software Engineer III', 'Senior Software Engineer', 'Staff Software Engineer',
    'Principal Software Engineer', 'Software Engineer Intern', 'Frontend Developer',
    'Backend Developer', 'Full Stack Developer', 'Mobile Developer', 'Data Engineer',
    'Data Scientist', 'Data Analyst', 'Machine Learning Engineer', 'DevOps Engineer',
    'Site Reliability Engineer', 'Security Engineer', 'QA Engineer', 'Engineering Manager',
    'Product Manager', 'UX Designer', 'Hardware Engineer', 'Electrical Engineer'];
