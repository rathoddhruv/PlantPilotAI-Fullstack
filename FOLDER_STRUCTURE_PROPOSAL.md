# Folder Restructuring Proposal

## Overview
This document proposes a clean architecture for the PlantPilotAI-Fullstack project. The goal is to organize the codebase into logical directories, making it easier to manage and maintain.

## Proposed Directory Structure
```
root/
  fe/                 # Frontend (Angular)
    src/
      app/
        components/
        services/
        modules/
      assets/
      environments/
  be/                 # Backend (FastAPI)
    routers/
    services/
    settings.py
    main.py
    run_dev.py
    requirements.txt
  ml/                 # ML Scripts and Data
    data/
    scripts/
    trainers/
    utils/
    models/
    runs/
  static/             # Static Files
    favicon.ico
  .gitattributes
  .gitignore
  LICENSE.md
  README.md
```

## Instructions to Migrate Safely

### Step 1: Create New Directories
Create the following directories if they don't already exist:
- `fe/`
- `be/`
- `ml/`

### Step 2: Move Files to New Directories
- **Backend Files**:
  - Move all backend files (e.g., `main.py`, `routers/`, `services/`) into the `be/` directory.
  
- **ML Scripts and Data**:
  - Ensure ML scripts are placed in the `ml/` directory. Organize data, scripts, trainers, utils, models, and runs accordingly.

- **Static Files**:
  - Place static files (e.g., `favicon.ico`) in the `static/` directory.

### Step 3: Update Import Paths
Update all import paths in the codebase to reflect the new directory structure. For example:
- Change `import some_module from '../some_file';` to `import some_module from 'be/some_file';`.

### Step 4: Create Angular Project
Set up a new Angular project in the `fe/` directory using the following command:
```bash
ng new fe --routing --style=scss
```

### Step 5: Update README.md
Update the `README.md` file to include the new directory structure and instructions for setting up and running the project.

## Summary
This proposed folder structure aims to improve the organization and maintainability of the PlantPilotAI-Fullstack project. By following these instructions, you can migrate your existing codebase into a more organized format.
