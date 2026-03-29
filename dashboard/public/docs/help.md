# Austin Telemetry Platform - Help Guide

> [!NOTE]
> Welcome to the Austin Telemetry Platform! This guide provides a high-level overview of the application's features and detailed instructions on how to use them.

## High-Level Overview

The Austin Telemetry Platform is a real-time tracking and monitoring dashboard that aggregates live data from two primary sources:
1. **Austin Capital Metro**: Live bus locations, routes, and stops.
2. **OpenSky Network**: Live flights operating above the Austin area.

This application is designed with a dual purpose: 
- To provide a rich, interactive **Map View** for users to explore current vehicle positions.
- To serve as an **SRE (Site Reliability Engineering) Dashboard**, showing live platform health, metrics, and offering incident simulation tools.

---

## 🗺️ Map Controls & Navigation

The Map is the core of the platform, continuously updating with live data.

### Basic Interactivity
* **Pan and Zoom**: Click and drag to pan across the map. Use the scroll wheel or pinch to zoom in and out.
* **Track a Vehicle**: Click on any bus or airplane icon to focus the map on that vehicle. The map will follow the vehicle as it moves.
* **View Details**: Hovering over or clicking on vehicles will display contextual information, such as route names or flight callsigns.

### Map Controls Panel (Bottom Left)
You will find a control panel floating on the map that allows you to customize the view:
* **Map Style**: Toggle the base map style between `Light`, `Dark`, and `Streets`.
* **Visibility Toggles**: Independent switches to show or hide **Bus Stops**, **Bus Routes**, **Flight Paths**, and **Vehicle Labels**.
* **Clustering**: When zoomed out, enabling the `Cluster Vehicles` option groups nearby vehicles together, reducing visual clutter.
* **Reset View**: Returns all map and filter settings to their default state.

### 🩺 Diagnostics & Health Checks
Located at the bottom of the Data Sources section in the Map Controls panel:
* **Check API Status**: This button performs a live diagnostic check of the **OpenSky Network** flight data provider. It displays:
    * **Rate Limit**: Your current remaining credits for the 24-hour period.
    * **Authentication Status**: Confirms if the system is correctly logged into a registered OpenSky account (4,000 credit tier).
    * **Upstream Health**: Real-time confirmation if the OpenSky service is reachable or if a Circuit Breaker has been tripped.

---

## 🎛️ Source Filtering

Located in the top header, the Source Filtering tools allow you to quickly control what data streams are active:
* **Metro Toggle**: Enable or disable the live ingest of Capital Metro buses.
* **Flights Toggle**: Enable or disable the live ingest of OpenSky flights.
* **Active Count**: Next to each toggle, you can see the current number of active vehicles being tracked in real time.

---

## 📊 SRE Dashboard (Right Sidebar)

The **SRE Sidebar** provides comprehensive observability for the platform's backend services. It is designed to help operators monitor system health and react to incidents.

### Key Sections:
* **Platform Health**: Displays the real-time status (Healthy, Degraded, Unhealthy) of the primary API, the Metro feed, and the Flight feed.
* **Live Metrics**: Shows active telemetry including API Success Rate, P95 Latency, Requests per minute, and Error Rate, accompanied by sparkline trends.
* **Vehicle Activity Chart**: A real-time graph mapping the volume of buses and flights connecting to the system.
* **SLO Status**: Evaluates the platform's performance against defined Service Level Objectives (SLOs) for Availability, Latency, and Error Rates.
* **Controls**: Buttons to manage active data ingestion (Suspend/Resume Azure Loop), Pause UI Polling, or clear the local data state entirely.

> [!TIP]
> You can collapse the SRE Sidebar by clicking the **▶** arrow button in its header to maximize the map view.

---

## 🚨 Incident Simulation

The platform includes built-in chaos engineering tools for testing system resilience. These are accessible via the floating panel on the right side of the map.

* **Simulate Metro Failure**: Injects an artificial outage into the Metro data feed, allowing you to observe how the dashboard handles a degraded state.
* **Simulate API Latency**: Artificially slows down the response time of the API (2500ms spike) to trigger latency warnings and SLO breaches.
* **Simulate API Errors**: Introduces a 20% error rate into API responses to trigger error rate alerts.

> [!WARNING]
> Using the incident simulation tools will trigger alert toasts and update the Metric monitoring charts. Be sure to clear these simulations to return the platform to a healthy state.

---

## 📖 Runbook & Logs

For in-depth troubleshooting:
* **Runbook**: Accessible via the `📖 Runbook` button in the SRE Sidebar, this document provides procedures for responding to specific outages.
* **System Logs**: Accessible via the `📋 Logs` button in the SRE Sidebar or by simulating an error. It provides chronological, live logging of background events occurring in the application.

---

## ⚙️ Settings
* **Dark Theme**: You can toggle the UI between Light and Dark mode using the button in the top header. This setting respects your preference and persists across sessions.

> [!IMPORTANT]
> A Circuit Breaker protects the Flight API from rate-limiting. If the OpenSky Network is overwhelmed, the platform will automatically pause flight requests for 5 minutes and notify you via a popup dialogue.
