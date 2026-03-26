from enum import Enum


class RoleEnum(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"


class DepartmentEnum(str, Enum):
    FINANCE = "finance"
    HR = "hr"
    IT = "it"
    OPERATIONS = "operations"


class TaskStatusEnum(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class PriorityEnum(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class AssignmentStateEnum(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    NO_MATCH = "no_match"


def enum_values(enum_cls: type[Enum]) -> list[str]:
    return [member.value for member in enum_cls]
