"""
Background Task Manager
Handles long-running extraction tasks asynchronously
"""

import threading
import time
import logging
from datetime import datetime
from enum import Enum
from typing import Dict, Optional, Callable

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Task:
    def __init__(self, task_id: str, task_type: str, func: Callable, args: tuple, kwargs: dict):
        self.task_id = task_id
        self.task_type = task_type
        self.func = func
        self.args = args
        self.kwargs = kwargs
        self.status = TaskStatus.PENDING
        self.progress = 0
        self.result = None
        self.error = None
        self.created_at = datetime.now()
        self.started_at = None
        self.completed_at = None
        self.message = "Task created"
    
    def to_dict(self):
        """Convert task to dictionary for API responses"""
        return {
            'taskId': self.task_id,
            'taskType': self.task_type,
            'status': self.status.value,
            'progress': self.progress,
            'message': self.message,
            'result': self.result,
            'error': self.error,
            'createdAt': self.created_at.isoformat(),
            'startedAt': self.started_at.isoformat() if self.started_at else None,
            'completedAt': self.completed_at.isoformat() if self.completed_at else None,
        }


class TaskManager:
    """
    Simple background task manager using threads
    For production, consider using Celery or RQ
    """
    
    def __init__(self, max_workers: int = 3):
        self.tasks: Dict[str, Task] = {}
        self.max_workers = max_workers
        self.active_workers = 0
        self.lock = threading.Lock()
        logger.info(f"TaskManager initialized with {max_workers} workers")
    
    def submit_task(self, task_id: str, task_type: str, func: Callable, *args, **kwargs) -> Task:
        """
        Submit a task for background processing
        
        Args:
            task_id: Unique task identifier
            task_type: Type of task (e.g., 'extraction')
            func: Function to execute
            *args, **kwargs: Arguments for the function
        
        Returns:
            Task object
        """
        task = Task(task_id, task_type, func, args, kwargs)
        
        with self.lock:
            self.tasks[task_id] = task
        
        logger.info(f"Task submitted: {task_id} ({task_type})")
        
        # Start task in background thread
        thread = threading.Thread(target=self._execute_task, args=(task,), daemon=True)
        thread.start()
        
        return task
    
    def _execute_task(self, task: Task):
        """Execute task in background thread"""
        try:
            # Wait if too many workers are active
            while self.active_workers >= self.max_workers:
                time.sleep(1)
            
            with self.lock:
                self.active_workers += 1
                task.status = TaskStatus.PROCESSING
                task.started_at = datetime.now()
                task.message = "Task processing started"
            
            logger.info(f"Task started: {task.task_id}")
            
            # Execute the actual task
            result = task.func(*task.args, **task.kwargs)
            
            with self.lock:
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.now()
                task.result = result
                task.progress = 100
                task.message = "Task completed successfully"
            
            logger.info(f"Task completed: {task.task_id}")
        
        except Exception as e:
            logger.error(f"Task failed: {task.task_id} - {str(e)}", exc_info=True)
            
            with self.lock:
                task.status = TaskStatus.FAILED
                task.completed_at = datetime.now()
                task.error = str(e)
                task.message = f"Task failed: {str(e)}"
        
        finally:
            with self.lock:
                self.active_workers -= 1
    
    def get_task(self, task_id: str) -> Optional[Task]:
        """Get task by ID"""
        with self.lock:
            return self.tasks.get(task_id)
    
    def get_task_status(self, task_id: str) -> Optional[Dict]:
        """Get task status as dictionary"""
        task = self.get_task(task_id)
        if task:
            return task.to_dict()
        return None
    
    def update_task_progress(self, task_id: str, progress: int, message: str = None):
        """Update task progress (called from task function)"""
        with self.lock:
            task = self.tasks.get(task_id)
            if task:
                task.progress = min(100, max(0, progress))
                if message:
                    task.message = message
    
    def cleanup_old_tasks(self, max_age_hours: int = 24):
        """Remove old completed/failed tasks"""
        from datetime import timedelta
        
        cutoff = datetime.now() - timedelta(hours=max_age_hours)
        
        with self.lock:
            task_ids_to_remove = []
            
            for task_id, task in self.tasks.items():
                if task.completed_at and task.completed_at < cutoff:
                    task_ids_to_remove.append(task_id)
            
            for task_id in task_ids_to_remove:
                del self.tasks[task_id]
            
            if task_ids_to_remove:
                logger.info(f"Cleaned up {len(task_ids_to_remove)} old tasks")


# Global task manager instance
task_manager = TaskManager(max_workers=3)

