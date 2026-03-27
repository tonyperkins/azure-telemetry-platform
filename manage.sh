#!/bin/bash
# Azure Telemetry Platform - Service Management Script
# Usage: ./manage.sh [start|stop|restart|status|logs]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METRO_DIR="$PROJECT_ROOT/src/MetroIngestion"
FLIGHT_DIR="$PROJECT_ROOT/src/FlightIngestion"
API_DIR="$PROJECT_ROOT/src/TelemetryApi"
DASHBOARD_DIR="$PROJECT_ROOT/dashboard"

PID_DIR="$PROJECT_ROOT/.pids"
LOG_DIR="$PROJECT_ROOT/.logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if a service is running
is_running() {
    local service=$1
    local pid_file="$PID_DIR/$service.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$pid_file"
            return 1
        fi
    fi
    return 1
}

# Stop a service
stop_service() {
    local service=$1
    local pid_file="$PID_DIR/$service.pid"
    
    if is_running "$service"; then
        local pid=$(cat "$pid_file")
        log_info "Stopping $service (PID: $pid)..."
        kill "$pid" 2>/dev/null || true
        sleep 2
        
        # Force kill if still running
        if ps -p "$pid" > /dev/null 2>&1; then
            log_warn "Force killing $service..."
            kill -9 "$pid" 2>/dev/null || true
        fi
        
        rm -f "$pid_file"
        log_success "$service stopped"
    else
        log_warn "$service is not running"
    fi
}

# Start MetroIngestion
start_metro() {
    if is_running "metro"; then
        log_warn "MetroIngestion is already running"
        return
    fi
    
    log_info "Starting MetroIngestion..."
    cd "$METRO_DIR"
    nohup func start --port 7071 > "$LOG_DIR/metro.log" 2>&1 &
    echo $! > "$PID_DIR/metro.pid"
    log_success "MetroIngestion started (PID: $!)"
}

# Start FlightIngestion
start_flight() {
    if is_running "flight"; then
        log_warn "FlightIngestion is already running"
        return
    fi
    
    log_info "Starting FlightIngestion..."
    cd "$FLIGHT_DIR"
    nohup func start --port 7072 > "$LOG_DIR/flight.log" 2>&1 &
    echo $! > "$PID_DIR/flight.pid"
    log_success "FlightIngestion started (PID: $!)"
}

# Start TelemetryApi
start_api() {
    if is_running "api"; then
        log_warn "TelemetryApi is already running"
        return
    fi
    
    log_info "Starting TelemetryApi..."
    cd "$API_DIR"
    nohup env ASPNETCORE_ENVIRONMENT=Development dotnet run > "$LOG_DIR/api.log" 2>&1 &
    echo $! > "$PID_DIR/api.pid"
    log_success "TelemetryApi started (PID: $!)"
}

# Start Dashboard
start_dashboard() {
    if is_running "dashboard"; then
        log_warn "Dashboard is already running"
        return
    fi
    
    log_info "Starting Dashboard..."
    cd "$DASHBOARD_DIR"
    nohup npm run dev > "$LOG_DIR/dashboard.log" 2>&1 &
    echo $! > "$PID_DIR/dashboard.pid"
    log_success "Dashboard started (PID: $!)"
}

# Build all services
build_all() {
    log_info "Building MetroIngestion..."
    cd "$METRO_DIR" && dotnet build
    
    log_info "Building FlightIngestion..."
    cd "$FLIGHT_DIR" && dotnet build
    
    log_info "Building TelemetryApi..."
    cd "$API_DIR" && dotnet build
    
    log_info "Building Dashboard..."
    cd "$DASHBOARD_DIR" && npm run build
    
    log_success "All services built successfully"
}

# Start all services
start_all() {
    log_info "Starting all services..."
    start_metro
    sleep 2
    start_flight
    sleep 2
    start_api
    sleep 3
    start_dashboard
    log_success "All services started"
    echo ""
    status_all
}

# Kill all orphaned processes
kill_all_orphans() {
    log_info "Searching for orphaned processes..."
    
    # Kill any vite/npm processes
    local vite_pids=$(ps aux | grep -E "vite|npm run dev" | grep -v grep | awk '{print $2}')
    if [ -n "$vite_pids" ]; then
        log_info "Killing orphaned dashboard processes: $vite_pids"
        echo "$vite_pids" | xargs kill -9 2>/dev/null || true
    fi
    
    # Kill any func start processes
    local func_pids=$(ps aux | grep "func start" | grep -v grep | awk '{print $2}')
    if [ -n "$func_pids" ]; then
        log_info "Killing orphaned function processes: $func_pids"
        echo "$func_pids" | xargs kill -9 2>/dev/null || true
    fi
    
    # Kill any dotnet run processes
    local dotnet_pids=$(ps aux | grep "dotnet run" | grep -v grep | awk '{print $2}')
    if [ -n "$dotnet_pids" ]; then
        log_info "Killing orphaned API processes: $dotnet_pids"
        echo "$dotnet_pids" | xargs kill -9 2>/dev/null || true
    fi
    
    log_success "Orphaned processes cleaned up"
}

# Stop all services
stop_all() {
    log_info "Stopping all services..."
    stop_service "dashboard"
    stop_service "api"
    stop_service "flight"
    stop_service "metro"
    
    # Also kill any orphaned processes
    kill_all_orphans
    
    log_success "All services stopped"
}

# Restart all services
restart_all() {
    log_info "Restarting all services..."
    stop_all
    sleep 2
    build_all
    sleep 1
    start_all
}

# Show status of all services
status_all() {
    echo ""
    echo "=== Service Status ==="
    
    if is_running "metro"; then
        echo -e "${GREEN}✓${NC} MetroIngestion    (PID: $(cat $PID_DIR/metro.pid))"
    else
        echo -e "${RED}✗${NC} MetroIngestion    (stopped)"
    fi
    
    if is_running "flight"; then
        echo -e "${GREEN}✓${NC} FlightIngestion   (PID: $(cat $PID_DIR/flight.pid))"
    else
        echo -e "${RED}✗${NC} FlightIngestion   (stopped)"
    fi
    
    if is_running "api"; then
        echo -e "${GREEN}✓${NC} TelemetryApi      (PID: $(cat $PID_DIR/api.pid))"
    else
        echo -e "${RED}✗${NC} TelemetryApi      (stopped)"
    fi
    
    if is_running "dashboard"; then
        echo -e "${GREEN}✓${NC} Dashboard         (PID: $(cat $PID_DIR/dashboard.pid))"
    else
        echo -e "${RED}✗${NC} Dashboard         (stopped)"
    fi
    
    echo ""
}

# Show logs
show_logs() {
    local service=$1
    
    if [ -z "$service" ]; then
        log_error "Usage: $0 logs [metro|flight|api|dashboard]"
        exit 1
    fi
    
    local log_file="$LOG_DIR/$service.log"
    
    if [ ! -f "$log_file" ]; then
        log_error "Log file not found: $log_file"
        exit 1
    fi
    
    tail -f "$log_file"
}

# Main command handler
case "${1:-}" in
    start)
        if [ -n "${2:-}" ]; then
            case "$2" in
                metro) start_metro ;;
                flight) start_flight ;;
                api) start_api ;;
                dashboard) start_dashboard ;;
                *) log_error "Unknown service: $2"; exit 1 ;;
            esac
        else
            start_all
        fi
        ;;
    
    stop)
        if [ -n "${2:-}" ]; then
            stop_service "$2"
        else
            stop_all
        fi
        ;;
    
    restart)
        restart_all
        ;;
    
    rebuild)
        build_all
        ;;
    
    status)
        status_all
        ;;
    
    logs)
        show_logs "${2:-}"
        ;;
    
    *)
        echo "Azure Telemetry Platform - Service Manager"
        echo ""
        echo "Usage: $0 [command] [service]"
        echo ""
        echo "Commands:"
        echo "  start [service]    Start all services or a specific service"
        echo "  stop [service]     Stop all services or a specific service"
        echo "  restart            Rebuild and restart all services"
        echo "  rebuild            Rebuild all services without restarting"
        echo "  status             Show status of all services"
        echo "  logs [service]     Tail logs for a specific service"
        echo ""
        echo "Services:"
        echo "  metro              MetroIngestion Function"
        echo "  flight             FlightIngestion Function"
        echo "  api                TelemetryApi"
        echo "  dashboard          React Dashboard"
        echo ""
        echo "Examples:"
        echo "  $0 start           # Start all services"
        echo "  $0 stop metro      # Stop only MetroIngestion"
        echo "  $0 restart         # Rebuild and restart everything"
        echo "  $0 logs flight     # View FlightIngestion logs"
        echo "  $0 status          # Check what's running"
        exit 1
        ;;
esac
