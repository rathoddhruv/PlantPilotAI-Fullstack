# Diagrams

## Project Structure Diagram
```mermaid
graph TD;
    Root-->FE[Frontend (Angular)];
    Root-->BE[Backend (FastAPI)];
    Root-->ML[ML Scripts and Data];
    Root-->Static[Static Files];
    FE-->Src[src/];
    Src-->App[app/];
    App-->Components[components/];
    App-->Services[services/];
    App-->Modules[modules/];
    Src-->Assets[assets/];
    Src-->Environments[environments/];
    BE-->Routers[routers/];
    BE-->Services[services/];
    BE-->Settings[settings.py];
    BE-->Main[main.py];
    BE-->RunDev[run_dev.py];
    BE-->Requirements[requirements.txt];
    ML-->Data[data/];
    ML-->Scripts[scripts/];
    ML-->Trainers[trainers/];
    ML-->Utils[utils/];
    ML-->Models[models/];
    ML-->Runs[runs/];
```

## Data Flow Diagram
```mermaid
graph TD;
    A[User Uploads Images] --> B[/upload API Endpoint];
    B --> C[predict_from_folder.py];
    C --> D[Prediction Results];
    D --> E[Display Predictions in UI];
    E --> F[Manual Review (if needed)];
    F --> G[manual_review.py];
    G --> H[Updated Labels];
    H --> I[boost_merge_labels.py];
    I --> J[fix_non_normalized_labels.py];
    J --> K[active_learning_pipeline.py];
    K --> L[Retrain Model];
    L --> M[Save Weights in /ml/runs/];
    E --> N[User Confirms Labels];
    N --> O[Save Labels];
```

## Interaction Diagram
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant ML

    User->>Frontend: Upload Images
    Frontend->>Backend: POST /upload
    Backend->>ML: Execute predict_from_folder.py
    ML-->>Backend: Return Predictions
    Backend-->>Frontend: Display Predictions
    Frontend->>User: Show Predictions
    User->>Frontend: Confirm or Correct Labels
    Frontend->>Backend: POST /manual_review
    Backend->>ML: Execute manual_review.py
    ML-->>Backend: Return Updated Labels
    Backend->>Frontend: Display Corrected Labels
    Frontend->>User: Show Corrected Labels
    User->>Frontend: Confirm Labels
    Frontend->>Backend: Save Labels
    Backend->>ML: Execute boost_merge_labels.py and fix_non_normalized_labels.py
    ML-->>Backend: Return Merged and Fixed Labels
    Backend->>ML: Execute active_learning_pipeline.py
    ML-->>Backend: Retrain Model
    Backend->>Frontend: Display Training Status
    Frontend->>User: Show Training Progress
