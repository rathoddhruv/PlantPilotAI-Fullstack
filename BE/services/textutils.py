# BE/services/textutils.py
import re
_ANSI = re.compile(r"\x1b\[[0-9;]*m")
def strip_ansi(s: str) -> str: return _ANSI.sub("", s or "")
