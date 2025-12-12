# Press Me - Spy Game Application

A React-based spy game application with Neon database backend, featuring team-based missions, agent authentication, and real-time mission tracking. The frontend connects directly to Neon database using serverless functions - no Express server required.

## 🎯 Game Overview

Press Me is an interactive spy game where players take on the role of secret agents competing in teams. Players receive missions, complete objectives, and earn points for their team while avoiding detection by opposing agents.

### Key Features
- **Team-based gameplay** (Red vs Blue teams)
- **Dynamic mission assignment** with 15-minute time limits
- **Agent authentication** with codename system
- **Real-time mission tracking** and completion
- **Intelligence sharing** between team members
- **Mission categories**: Social, Sabotage, Team, and Object missions

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Neon database account** (free tier available at [neon.tech](https://neon.tech))

### 1. Clone the Repository
```bash
git clone <repository-url>
cd press-me
```

### 2. Install Dependencies

**Frontend:**
```bash
npm install
```

**Server scripts (for database setup):**
```bash
cd server
npm install
cd ..
```

### 3. Database Setup

**Create Neon Database:**
1. Sign up for a free account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy your connection string from the Neon dashboard

**Configure Environment:**
```bash
cd server
cp env.example .env
```

Edit `server/.env` with your Neon connection string:
```env
POSTGRES_URL=postgresql://username:password@host/database?sslmode=require
```

**Initialize Database:**
```bash
cd server
npm run setup-db-neon
```

This will create all tables and seed initial data.

### 4. Start the Application

**Frontend only (no backend server needed):**
```bash
npm run dev
```

The application runs on: http://localhost:5173

### 5. Access the Game
1. Open http://localhost:5173 in your browser
2. Enter your agent alias (e.g., "Swift Spider", "Invisible Mouse", or "Swift_Spider")
3. You'll be redirected to the passphrase entry page (`/login/{encodedAlias}`). This allows you to have users skip steps 1 and 2 when given a QRcode or NFC with their unique agent login.
4. Enter your passphrase (you'll see a hint showing all words except the last word)
5. After successful authentication, you'll be taken to the dashboard
6. View your mission briefing by navigating to the mission page (if needed)

## 🎮 How to Play

### Agent Login (Two-Step Process)

**Step 1: Enter Alias**
- Enter your agent alias on the home page
- Format: "Alias1 Alias2" (e.g., "Swift Spider")
- Also accepts: "Alias1_Alias2" or "Alias1Alias2" (case-insensitive)
- If the alias is valid, you'll be redirected to the passphrase page

**Step 2: Enter Passphrase**
- You'll see a hint showing all words of your passphrase except the last word
- Enter the last word of your passphrase to complete authentication
- Example: If your passphrase is "Not every bird is an eagle.", the hint shows "Not every bird is an" and you enter "eagle."

**Security Features:**
- Failed login attempts are logged and tracked
- After 5 failed attempts, the system locks out with a security warning
- You must contact a host to unlock your account after lockout

### Mission System
- **Mission Types:**
  - **Social**: Interact with other players
  - **Sabotage**: Disrupt other players' activities
  - **Team**: Coordinate with teammates
  - **Object**: Find or identify specific items

- **Mission Assignment:**
  - Missions are assigned for 15 minutes
  - Use "REFRESH MISSIONS" to get new assignments
  - Each mission has a success key for completion

### Team Competition
- **Red Team** vs **Blue Team**
- Complete missions to earn points for your team
- Track team progress and compete for victory

## 🛠️ Development

### Project Structure
```
press-me/
├── src/                    # React frontend
│   ├── App.jsx            # Main app component
│   ├── Dashboard.jsx      # Mission dashboard
│   ├── Login.jsx          # Authentication
│   ├── Mission.jsx        # Mission briefing
│   ├── AdminDashboard.jsx # Admin interface
│   ├── neonApi.js         # Neon database API (direct connection)
│   └── App.css            # Styles
├── server/                # Database setup scripts (not a running server)
│   ├── setup-neon.js     # Database setup script
│   ├── reset-users.js    # User management utility
│   ├── database.sql      # Database schema reference
│   ├── check-user-missions.js    # Debugging utility
│   ├── dump-mission-tables.js    # Debugging utility
│   └── generate-login-urls.js   # Utility script
├── arduino/               # Arduino sketches
│   └── arduino_serial_test.ino
└── public/                # Static assets
```

### Architecture

This application uses a **serverless architecture**:
- **Frontend**: React SPA that connects directly to Neon database
- **Database**: Neon PostgreSQL (serverless)
- **Database API**: All database logic is in `src/neonApi.js`

The `server/` folder contains utility scripts for database setup and maintenance, but there is no running server.

### Database Schema

The database includes the following tables:

**Core Tables:**
- `users` - Agent information (firstname, lastname, alias_1, alias_2, team, passphrase, score)
- `missions` - Legacy mission system
- `teams` - Team information and points
- `intel` - Intelligence clues
- `login_logs` - Login attempt tracking

**Mission Tables:**
- `book_missions` - Book-based missions with team-specific clues
- `passphrase_missions` - Passphrase completion missions
- `object_missions` - Object identification missions

**Game Management:**
- `sessions` - Game session management
- `agent_intel` - Agent knowledge tracking
- `assignment_timestamp` - Mission assignment timing

See `server/setup-neon.js` for the complete schema definition.

## 🔧 Configuration

### Environment Variables
Create `server/.env`:
```env
POSTGRES_URL=postgresql://username:password@host/database?sslmode=require
```

Get your connection string from the Neon dashboard.

### Adding New Missions
1. Edit `server/setup-neon.js`
2. Add mission objects to the appropriate arrays (book_missions, passphrase_missions, or object_missions)
3. Run `npm run setup-db-neon` in the server directory to recreate database with new missions

### Customizing Agents
1. Edit `server/setup-neon.js`
2. Modify the users array in the setupNeonDatabase function
3. Run `npm run setup-db-neon` to recreate database with new agents

### Utility Scripts

The `server/` directory contains utility scripts for database maintenance and debugging:

**Database Setup:**
- `setup-neon.js` - Main database setup script (creates all tables and seeds data)
- `reset-users.js` - Reset users table (note: currently uses local PostgreSQL, may need updating for Neon)

**Debugging Utilities:**
- `check-user-missions.js` - Check which missions are assigned to a specific user
  - Usage: `cd server && node check-user-missions.js [userId]` (or no args to check all users)
- `dump-mission-tables.js` - Generate a dump of all mission tables and assignments
  - Usage: `cd server && node dump-mission-tables.js`
  - Creates a timestamped dump file in the server directory
- `generate-login-urls.js` - Generate login URLs for all users (useful for creating QR codes/NFC tags)
  - Usage: `cd server && node generate-login-urls.js`

## 🐛 Troubleshooting

### Database Connection Issues
- Verify your Neon connection string in `server/.env` is correct
- Check that your Neon database is active in the Neon dashboard
- Ensure `POSTGRES_URL` environment variable is set correctly
- Check browser console for connection errors

### Mission Issues
- Reset all data: `cd server && npm run setup-db-neon`
- Check mission assignments: `cd server && node check-user-missions.js [userId]`
- Generate mission dump: `cd server && node dump-mission-tables.js`

### Setup Script Issues
- Ensure `POSTGRES_URL` is set in `server/.env` file
- Check that you have write permissions on the Neon database
- Verify all required tables are created: `cd server && node check-user-missions.js` (will fail if tables don't exist)
- Test Neon connection: `cd server && node -e "import('@neondatabase/serverless').then(m => { const sql = m.neon(process.env.POSTGRES_URL); sql\`SELECT NOW()\`.then(r => console.log('Connected:', r)).catch(e => console.error('Connection failed:', e)) })"`

### Frontend Issues
- Clear browser cache
- Check browser console for errors
- Verify Neon database connection string is correct
- Check that database tables exist (run setup script if needed)

## 📝 Game Customization

### Mission Types
The game supports 4 mission types:
- **Social**: Player interaction missions
- **Sabotage**: Disruption missions  
- **Team**: Team coordination missions
- **Object**: Item identification missions

### Time Limits
- Mission assignment: 15 minutes (configurable per session)
- Configurable in session settings via Admin Dashboard

### Team System
- Two teams: Red and Blue
- Point-based scoring
- Team-specific missions available

## 🔒 Security Notes

- Passphrases are stored in plain text (development only)
- Login attempts are logged with IP addresses
- Security lockout after 5 failed attempts
- No rate limiting implemented
- CORS enabled for development

## 📄 License

This project is for educational and entertainment purposes.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review browser console for errors
3. Verify Neon database connection
4. Check that all dependencies are installed
5. Ensure database tables are set up (run `npm run setup-db-neon` in server directory)

---

**Happy Spying! 🕵️‍♂️🕵️‍♀️**