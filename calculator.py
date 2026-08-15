"""A small command-line calculator for the four basic operations."""


def get_number(prompt):
    """Keep asking until the user supplies a valid number."""
    while True:
        try:
            return float(input(prompt))
        except ValueError:
            print("Please enter a valid number.")


def calculate(first, operator, second):
    """Return the result for a supported calculator operation."""
    if operator == "+":
        return first + second
    if operator == "-":
        return first - second
    if operator == "*":
        return first * second
    if operator == "/":
        if second == 0:
            raise ZeroDivisionError("Division by zero is not allowed.")
        return first / second
    raise ValueError("Unsupported operator.")


def main():
    print("Simple Python Calculator")
    print("Available operations: +  -  *  /")

    while True:
        first = get_number("First number: ")

        operator = input("Operation (+, -, *, /): ").strip()
        while operator not in {"+", "-", "*", "/"}:
            operator = input("Choose +, -, *, or /: ").strip()

        second = get_number("Second number: ")

        try:
            result = calculate(first, operator, second)
            print(f"Result: {result:g}")
        except ZeroDivisionError as error:
            print(error)

        again = input("Calculate again? (y/n): ").strip().lower()
        if again != "y":
            print("Thanks for using the calculator!")
            break
        print()


if __name__ == "__main__":
    main()
